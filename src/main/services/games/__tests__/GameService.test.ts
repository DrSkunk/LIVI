import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appOn: vi.fn(),
  spawn: vi.fn(),
  scan: vi.fn(),
  hide: vi.fn(),
  show: vi.fn(),
  focus: vi.fn(),
  restore: vi.fn()
}))

vi.mock('electron', () => ({
  app: { on: mocks.appOn },
  BrowserWindow: { getAllWindows: () => [] }
}))

vi.mock('node:child_process', () => ({ spawn: mocks.spawn }))
vi.mock('../libraryScanner', () => ({ scanGameLibrary: mocks.scan }))
vi.mock('@main/window/createWindow', () => ({
  getMainWindow: () => ({
    hide: mocks.hide,
    show: mocks.show,
    focus: mocks.focus,
    restore: mocks.restore,
    isMinimized: () => false,
    isDestroyed: () => false
  })
}))

import { GameService } from '../GameService'

function childProcess() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter
    stderr: EventEmitter
    kill: ReturnType<typeof vi.fn>
  }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.kill = vi.fn()
  return child
}

describe('GameService', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.scan.mockResolvedValue([
      {
        id: 'game-id',
        title: 'Game',
        system: 'System',
        hasThumbnail: false,
        romPath: '/roms/game.rom',
        corePath: '/cores/core.so'
      }
    ])
  })

  test('hides LIVI after spawn and restores it when RetroArch closes', async () => {
    const child = childProcess()
    mocks.spawn.mockReturnValue(child)
    const service = new GameService({
      config: {
        games: {
          enabled: true,
          retroArchPath: 'retroarch',
          playlistDirectory: '/playlists',
          thumbnailDirectory: '/thumbnails'
        }
      },
      isQuitting: false
    } as never)

    await service.getLibrary()
    const launched = service.launch('game-id')
    await Promise.resolve()
    child.emit('spawn')
    await expect(launched).resolves.toEqual({ ok: true })

    expect(mocks.spawn).toHaveBeenCalledWith(
      'retroarch',
      ['--fullscreen', '-L', '/cores/core.so', '/roms/game.rom'],
      expect.objectContaining({ shell: false })
    )
    expect(mocks.hide).toHaveBeenCalledOnce()

    child.emit('close', 0, null)
    expect(mocks.show).toHaveBeenCalled()
    expect(mocks.focus).toHaveBeenCalled()
    vi.runAllTimers()
  })

  test('opens the fullscreen RetroArch menu for library setup', async () => {
    const child = childProcess()
    mocks.spawn.mockReturnValue(child)
    const service = new GameService({
      config: {
        games: {
          enabled: true,
          retroArchPath: 'retroarch',
          playlistDirectory: '/playlists',
          thumbnailDirectory: '/thumbnails'
        }
      },
      isQuitting: false
    } as never)

    const opened = service.openRetroArch()
    await Promise.resolve()
    child.emit('spawn')
    await expect(opened).resolves.toEqual({ ok: true })

    expect(mocks.spawn).toHaveBeenCalledWith(
      'retroarch',
      ['--fullscreen', '--menu'],
      expect.objectContaining({ shell: false })
    )
  })
})
