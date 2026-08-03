import { createHash } from 'node:crypto'
import { type Dirent, promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, join } from 'node:path'
import type { GameLibraryItem, GamesConfig } from '@shared/types'

export type GameRecord = GameLibraryItem & {
  romPath: string
  corePath?: string
  thumbnailPath?: string
}

type PlaylistItem = {
  path?: unknown
  label?: unknown
  core_path?: unknown
  db_name?: unknown
}

type Playlist = {
  items?: unknown
}

const THUMBNAIL_FOLDERS = ['Named_Boxarts', 'Named_Titles', 'Named_Snaps'] as const
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'] as const

export function expandGameDirectory(directory: string): string {
  const value = directory.trim()
  if (value === '~') return homedir()
  if (value.startsWith('~/')) return join(homedir(), value.slice(2))
  return value
}

async function findPlaylists(directory: string): Promise<string[]> {
  if (!directory.trim()) return []

  const out: string[] = []
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
        else if (entry.isFile() && extname(entry.name).toLowerCase() === '.lpl') out.push(path)
      })
    )
  }

  await visit(directory)
  return out.sort((a, b) => a.localeCompare(b))
}

function safeThumbnailName(label: string): string {
  return label.replace(/[&*/:`<>?\\|]/g, '_')
}

async function firstExisting(paths: string[]): Promise<string | undefined> {
  for (const path of paths) {
    try {
      const stat = await fs.stat(path)
      if (stat.isFile()) return path
    } catch {
      // Try next thumbnail convention.
    }
  }
  return undefined
}

async function resolveThumbnail(
  directory: string,
  system: string,
  label: string
): Promise<string | undefined> {
  if (!directory.trim()) return undefined

  const names = Array.from(new Set([label, safeThumbnailName(label)]))
  const candidates = THUMBNAIL_FOLDERS.flatMap((folder) =>
    names.flatMap((name) =>
      IMAGE_EXTENSIONS.map((extension) => join(directory, system, folder, name + extension))
    )
  )
  return firstExisting(candidates)
}

function gameId(romPath: string, corePath?: string): string {
  return createHash('sha256')
    .update(`${romPath}\0${corePath ?? ''}`)
    .digest('hex')
    .slice(0, 24)
}

export async function scanGameLibrary(config: GamesConfig): Promise<GameRecord[]> {
  const playlistDirectory = expandGameDirectory(config.playlistDirectory)
  const thumbnailDirectory = expandGameDirectory(config.thumbnailDirectory)
  const playlists = await findPlaylists(playlistDirectory)
  const games: GameRecord[] = []
  const seen = new Set<string>()

  for (const playlistPath of playlists) {
    let playlist: Playlist
    try {
      playlist = JSON.parse(await fs.readFile(playlistPath, 'utf8')) as Playlist
    } catch (error) {
      console.warn(`[games] skipped invalid playlist ${playlistPath}`, error)
      continue
    }

    if (!Array.isArray(playlist.items)) continue
    const playlistSystem = basename(playlistPath, extname(playlistPath))

    for (const raw of playlist.items as PlaylistItem[]) {
      if (!raw || typeof raw !== 'object') continue
      if (typeof raw.path !== 'string' || !raw.path.trim()) continue

      const romPath = raw.path
      const title =
        typeof raw.label === 'string' && raw.label.trim()
          ? raw.label.trim()
          : basename(romPath, extname(romPath))
      const dbName = typeof raw.db_name === 'string' ? raw.db_name : ''
      const system = dbName ? basename(dbName, extname(dbName)) : playlistSystem
      const corePath =
        typeof raw.core_path === 'string' && raw.core_path && raw.core_path !== 'DETECT'
          ? raw.core_path
          : undefined
      const id = gameId(romPath, corePath)
      if (seen.has(id)) continue
      seen.add(id)

      const thumbnailPath = await resolveThumbnail(thumbnailDirectory, system, title)
      games.push({
        id,
        title,
        system,
        romPath,
        corePath,
        thumbnailPath,
        hasThumbnail: Boolean(thumbnailPath)
      })
    }
  }

  return games.sort((a, b) => a.title.localeCompare(b.title))
}
