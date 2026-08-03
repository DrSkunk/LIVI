import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appOn: vi.fn(),
  spawn: vi.fn(),
  scan: vi.fn(),
  hide: vi.fn(),
  show: vi.fn(),
  focus: vi.fn(),
  moveTop: vi.fn(),
  invalidate: vi.fn(),
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
    moveTop: mocks.moveTop,
    webContents: { invalidate: mocks.invalidate },
    getContentBounds: () => ({ x: 0, y: 0, width: 800, height: 480 }),
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

  test('keeps LIVI mapped behind RetroArch and raises it when RetroArch closes', async () => {
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
      ['--fullscreen', '--size=800x480', '-L', '/cores/core.so', '/roms/game.rom'],
      expect.objectContaining({ shell: false })
    )
    expect(mocks.hide).not.toHaveBeenCalled()

    child.emit('close', 0, null)
    expect(mocks.show).toHaveBeenCalled()
    expect(mocks.moveTop).toHaveBeenCalled()
    expect(mocks.focus).toHaveBeenCalled()
    expect(mocks.invalidate).toHaveBeenCalled()
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
      ['--fullscreen', '--size=800x480', '--menu'],
      expect.objectContaining({ shell: false })
    )
  })
})
