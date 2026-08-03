import { promises as fs } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { expandGameDirectory, scanGameLibrary } from '../libraryScanner'

const roots: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

async function fixture(): Promise<{ root: string; playlists: string; thumbnails: string }> {
  const root = await fs.mkdtemp(join(tmpdir(), 'livi-games-'))
  roots.push(root)
  const playlists = join(root, 'playlists')
  const thumbnails = join(root, 'thumbnails')
  await fs.mkdir(playlists, { recursive: true })
  return { root, playlists, thumbnails }
}

describe('scanGameLibrary', () => {
  test('expands RetroArch paths relative to the user home directory', () => {
    expect(expandGameDirectory('~/Games/roms')).toBe(join(homedir(), 'Games/roms'))
    expect(expandGameDirectory('/srv/roms')).toBe('/srv/roms')
  })

  test('reads RetroArch playlists and resolves box art', async () => {
    const { playlists, thumbnails } = await fixture()
    const system = 'Nintendo - Nintendo Entertainment System'
    const boxArt = join(thumbnails, system, 'Named_Boxarts')
    await fs.mkdir(boxArt, { recursive: true })
    await fs.writeFile(join(boxArt, 'Super Mario Bros..png'), 'image')
    await fs.writeFile(
      join(playlists, `${system}.lpl`),
      JSON.stringify({
        version: '1.0',
        items: [
          {
            path: '/roms/mario.nes',
            label: 'Super Mario Bros.',
            core_path: '/cores/nestopia_libretro.so',
            db_name: `${system}.lpl`
          }
        ]
      })
    )

    const games = await scanGameLibrary({
      enabled: true,
      retroArchPath: 'retroarch',
      romDirectory: '/roms',
      playlistDirectory: playlists,
      thumbnailDirectory: thumbnails
    })

    expect(games).toHaveLength(1)
    expect(games[0]).toMatchObject({
      title: 'Super Mario Bros.',
      system,
      romPath: '/roms/mario.nes',
      corePath: '/cores/nestopia_libretro.so',
      hasThumbnail: true,
      thumbnailPath: join(boxArt, 'Super Mario Bros..png')
    })
  })

  test('skips malformed playlists and ignores duplicate entries', async () => {
    const { playlists } = await fixture()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await fs.writeFile(join(playlists, 'broken.lpl'), '{')
    await fs.writeFile(
      join(playlists, 'Arcade.lpl'),
      JSON.stringify({
        items: [
          { path: '/roms/game.zip', label: 'Game', core_path: 'DETECT' },
          { path: '/roms/game.zip', label: 'Game', core_path: 'DETECT' }
        ]
      })
    )

    const games = await scanGameLibrary({
      enabled: true,
      retroArchPath: 'retroarch',
      romDirectory: '/roms',
      playlistDirectory: playlists,
      thumbnailDirectory: ''
    })

    expect(games).toHaveLength(1)
    expect(games[0]).toMatchObject({ title: 'Game', system: 'Arcade', corePath: undefined })
  })
})
