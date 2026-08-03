import { type Dirent, promises as fs } from 'node:fs'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import type { GameImportResult, GamesConfig } from '@shared/types'
import { expandGameDirectory } from './libraryScanner'

type SystemDefinition = {
  id: string
  folder: string
  playlist: string
  thumbnailRepo: string
  folders: RegExp
  extensions: Set<string>
  cores: Array<{ file: string; name: string }>
}

type ImportedRom = {
  path: string
  label: string
  system: SystemDefinition
  corePath?: string
  coreName?: string
}

const archiveExtensions = new Set(['.zip', '.7z'])

const systems: SystemDefinition[] = [
  {
    id: 'gba',
    folder: 'gba',
    playlist: 'Nintendo - Game Boy Advance',
    thumbnailRepo: 'Nintendo_-_Game_Boy_Advance',
    folders: /(^|[/\\])(gba|game[ _-]?boy[ _-]?advance)([/\\]|$)/i,
    extensions: new Set(['.gba']),
    cores: [{ file: 'mgba_libretro.so', name: 'mGBA' }]
  },
  {
    id: 'gbc',
    folder: 'gameboy-color',
    playlist: 'Nintendo - Game Boy Color',
    thumbnailRepo: 'Nintendo_-_Game_Boy_Color',
    folders: /(^|[/\\])(gbc|game[ _-]?boy[ _-]?color)([/\\]|$)/i,
    extensions: new Set(['.gbc']),
    cores: [
      { file: 'gambatte_libretro.so', name: 'Gambatte' },
      { file: 'mgba_libretro.so', name: 'mGBA' }
    ]
  },
  {
    id: 'gb',
    folder: 'gameboy',
    playlist: 'Nintendo - Game Boy',
    thumbnailRepo: 'Nintendo_-_Game_Boy',
    folders: /(^|[/\\])(gb|game[ _-]?boy)([/\\]|$)/i,
    extensions: new Set(['.gb']),
    cores: [
      { file: 'gambatte_libretro.so', name: 'Gambatte' },
      { file: 'mgba_libretro.so', name: 'mGBA' }
    ]
  },
  {
    id: 'nds',
    folder: 'nds',
    playlist: 'Nintendo - Nintendo DS',
    thumbnailRepo: 'Nintendo_-_Nintendo_DS',
    folders: /(^|[/\\])(nds|nintendo[ _-]?ds)([/\\]|$)/i,
    extensions: new Set(['.nds']),
    cores: [{ file: 'desmume_libretro.so', name: 'DeSmuME' }]
  },
  {
    id: 'nes',
    folder: 'nes',
    playlist: 'Nintendo - Nintendo Entertainment System',
    thumbnailRepo: 'Nintendo_-_Nintendo_Entertainment_System',
    folders: /(^|[/\\])(nes|nintendo[ _-]?entertainment[ _-]?system)([/\\]|$)/i,
    extensions: new Set(['.nes']),
    cores: [{ file: 'nestopia_libretro.so', name: 'Nestopia UE' }]
  },
  {
    id: 'snes',
    folder: 'snes',
    playlist: 'Nintendo - Super Nintendo Entertainment System',
    thumbnailRepo: 'Nintendo_-_Super_Nintendo_Entertainment_System',
    folders: /(^|[/\\])(snes|super[ _-]?nintendo)([/\\]|$)/i,
    extensions: new Set(['.sfc', '.smc']),
    cores: [{ file: 'snes9x_libretro.so', name: 'Snes9x' }]
  },
  {
    id: 'genesis',
    folder: 'genesis',
    playlist: 'Sega - Mega Drive - Genesis',
    thumbnailRepo: 'Sega_-_Mega_Drive_-_Genesis',
    folders: /(^|[/\\])(genesis|mega[ _-]?drive)([/\\]|$)/i,
    extensions: new Set(['.md', '.gen', '.smd']),
    cores: [{ file: 'genesis_plus_gx_libretro.so', name: 'Genesis Plus GX' }]
  },
  {
    id: 'mastersystem',
    folder: 'master-system',
    playlist: 'Sega - Master System - Mark III',
    thumbnailRepo: 'Sega_-_Master_System_-_Mark_III',
    folders: /(^|[/\\])(master[ _-]?system|sms)([/\\]|$)/i,
    extensions: new Set(['.sms', '.sg', '.gg']),
    cores: [{ file: 'genesis_plus_gx_libretro.so', name: 'Genesis Plus GX' }]
  }
]

async function walk(directory: string): Promise<string[]> {
  const files: string[] = []
  const visit = async (dir: string): Promise<void> => {
    let entries: Dirent<string>[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    await Promise.all(
      entries.map(async (entry) => {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) await visit(path)
        else if (entry.isFile()) files.push(path)
      })
    )
  }
  await visit(directory)
  return files.sort((a, b) => a.localeCompare(b))
}

function systemFor(path: string, root: string): SystemDefinition | undefined {
  const relative = path.slice(root.length)
  const extension = extname(path).toLowerCase()
  const folderSystem = systems.find((system) => system.folders.test(relative))
  if (
    folderSystem &&
    (folderSystem.extensions.has(extension) || archiveExtensions.has(extension))
  ) {
    return folderSystem
  }
  return systems.find((system) => system.extensions.has(extension))
}

function titleFor(path: string): string {
  return basename(path, extname(path)).trim()
}

function thumbnailName(title: string): string {
  return title.replace(/[&*/:`<>?\\|]/g, '_')
}

async function firstFile(paths: string[]): Promise<string | undefined> {
  for (const path of paths) {
    try {
      if ((await fs.stat(path)).isFile()) return path
    } catch {}
  }
  return undefined
}

async function resolveCore(system: SystemDefinition): Promise<{ path?: string; name?: string }> {
  const home = expandGameDirectory('~')
  const roots = [
    join(home, '.config/retroarch/cores'),
    '/usr/lib/aarch64-linux-gnu/libretro',
    '/usr/lib/arm-linux-gnueabihf/libretro',
    '/usr/lib/x86_64-linux-gnu/libretro',
    '/usr/lib/libretro'
  ]
  for (const core of system.cores) {
    const path = await firstFile(roots.map((root) => join(root, core.file)))
    if (path) return { path, name: core.name }
  }
  return {}
}

async function readPlaylist(path: string): Promise<{ items?: unknown }> {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8')) as { items?: unknown }
  } catch {
    return {}
  }
}

async function writePlaylist(
  directory: string,
  root: string,
  system: SystemDefinition,
  roms: ImportedRom[]
): Promise<void> {
  await fs.mkdir(directory, { recursive: true })
  const path = join(directory, `${system.playlist}.lpl`)
  const previous = await readPlaylist(path)
  const oldItems = Array.isArray(previous.items)
    ? (previous.items as Array<Record<string, unknown>>)
    : []
  const rootPrefix = root.endsWith(sep) ? root : root + sep
  const preserved = oldItems.filter(
    (item) => typeof item.path !== 'string' || !resolve(item.path).startsWith(rootPrefix)
  )
  const items = roms.map((rom) => ({
    path: rom.path,
    label: rom.label,
    core_path: rom.corePath ?? 'DETECT',
    core_name: rom.coreName ?? 'DETECT',
    crc32: 'DETECT',
    db_name: `${system.playlist}.lpl`
  }))
  const tmp = `${path}.tmp`
  await fs.writeFile(
    tmp,
    JSON.stringify({ version: '1.5', items: [...preserved, ...items] }, null, 2)
  )
  await fs.rename(tmp, path)
}

async function downloadThumbnail(
  directory: string,
  rom: ImportedRom
): Promise<'existing' | 'downloaded' | 'missing'> {
  const folder = join(directory, rom.system.playlist, 'Named_Boxarts')
  const destination = join(folder, `${thumbnailName(rom.label)}.png`)
  try {
    if ((await fs.stat(destination)).isFile()) return 'existing'
  } catch {}

  const encoded = encodeURIComponent(`${thumbnailName(rom.label)}.png`)
  const url = `https://raw.githubusercontent.com/libretro-thumbnails/${rom.system.thumbnailRepo}/master/Named_Boxarts/${encoded}`
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
    if (!response.ok) return 'missing'
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) return 'missing'
    await fs.mkdir(folder, { recursive: true })
    await fs.writeFile(destination, bytes)
    return 'downloaded'
  } catch {
    return 'missing'
  }
}

export async function importRomLibrary(config: GamesConfig): Promise<GameImportResult> {
  const root = resolve(expandGameDirectory(config.romDirectory))
  const playlistDirectory = resolve(expandGameDirectory(config.playlistDirectory))
  const thumbnailDirectory = resolve(expandGameDirectory(config.thumbnailDirectory))
  await fs.mkdir(root, { recursive: true })
  await Promise.all(
    systems.map((system) => fs.mkdir(join(root, system.folder), { recursive: true }))
  )

  const allFiles = await walk(root)
  const multiDiscDirs = new Set(
    allFiles.filter((path) => extname(path).toLowerCase() === '.m3u').map((path) => dirname(path))
  )
  const selected = allFiles.filter((path) => {
    const extension = extname(path).toLowerCase()
    return !(
      multiDiscDirs.has(dirname(path)) && ['.cue', '.chd', '.pbp', '.ccd'].includes(extension)
    )
  })

  const coreBySystem = new Map<string, { path?: string; name?: string }>()
  const imported: ImportedRom[] = []
  for (const path of selected) {
    const system = systemFor(path, root)
    if (!system) continue
    let core = coreBySystem.get(system.id)
    if (!core) {
      core = await resolveCore(system)
      coreBySystem.set(system.id, core)
    }
    imported.push({
      path,
      label: titleFor(path),
      system,
      corePath: core.path,
      coreName: core.name
    })
  }

  let playlistCount = 0
  for (const system of systems) {
    const roms = imported.filter((rom) => rom.system.id === system.id)
    if (roms.length === 0) continue
    await writePlaylist(playlistDirectory, root, system, roms)
    playlistCount++
  }

  let thumbnailsDownloaded = 0
  let thumbnailsMissing = 0
  let nextThumbnail = 0
  const workers = Array.from({ length: Math.min(6, imported.length) }, async () => {
    while (nextThumbnail < imported.length) {
      const rom = imported[nextThumbnail++]
      const result = await downloadThumbnail(thumbnailDirectory, rom)
      if (result === 'downloaded') thumbnailsDownloaded++
      if (result === 'missing') thumbnailsMissing++
    }
  })
  await Promise.all(workers)

  const missingCores = [
    ...new Set(imported.filter((rom) => !rom.corePath).map((rom) => rom.system.playlist))
  ]
  return {
    games: imported.length,
    playlists: playlistCount,
    thumbnailsDownloaded,
    thumbnailsMissing,
    missingCores
  }
}
