import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { importRomLibrary } from '../RomImporter'

const roots: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await fs.mkdtemp(join(tmpdir(), 'livi-import-'))
  roots.push(root)
  const roms = join(root, 'roms')
  const playlists = join(root, 'playlists')
  const thumbnails = join(root, 'thumbnails')
  await fs.mkdir(join(roms, 'gameboy'), { recursive: true })
  await fs.mkdir(join(roms, 'gba'), { recursive: true })
  await fs.writeFile(join(roms, 'gameboy', 'Tetris (World).gb'), 'rom')
  await fs.writeFile(join(roms, 'gba', 'Advance Wars (USA).gba'), 'rom')
  return { roms, playlists, thumbnails }
}

describe('importRomLibrary', () => {
  test('creates playlists and downloads box art', async () => {
    const { roms, playlists, thumbnails } = await fixture()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    )

    const result = await importRomLibrary({
      enabled: true,
      retroArchPath: 'retroarch',
      romDirectory: roms,
      playlistDirectory: playlists,
      thumbnailDirectory: thumbnails
    })

    expect(result).toMatchObject({ games: 3, playlists: 3, thumbnailsDownloaded: 3 })
    for (const folder of [
      'gameboy',
      'gameboy-color',
      'gba',
      'nds',
      'nes',
      'snes',
      'genesis',
      'master-system'
    ]) {
      await expect(fs.stat(join(roms, folder))).resolves.toMatchObject({})
    }
    expect(result.missingCores).toEqual(['Nintendo - Game Boy', 'Nintendo - Game Boy Advance'])

    await expect(
      fs.stat(join(thumbnails, 'Nintendo - Game Boy', 'Named_Boxarts', 'Tetris (World).png'))
    ).resolves.toMatchObject({})
  })
})
