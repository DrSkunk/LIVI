import type { Mock } from 'vitest'

type IpcHandler = (evt: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, IpcHandler>()

vi.mock('@main/ipc/register', () => ({
  registerIpcHandle: (channel: string, handler: IpcHandler) => {
    handlers.set(channel, handler)
  },
  registerIpcOn: vi.fn()
}))

const { fromWebContents } = vi.hoisted(() => ({ fromWebContents: vi.fn() }))
vi.mock('electron', () => ({ BrowserWindow: { fromWebContents } }))

import { SendCommand } from '../../messages/sendable'
import { registerClusterIpc } from '../cluster'

function freshHost() {
  return {
    getConfig: vi.fn(function () {
      return {
        dashboards: { dash3: { main: true, dash: false, aux: false } }
      }
    }) as Mock,
    setClusterRequested: vi.fn(),
    isMainClusterWindow: vi.fn(() => true),
    isClusterRequested: vi.fn(() => false),
    setClusterVisible: vi.fn(),
    resetLastClusterVideoSize: vi.fn(),
    getLastClusterVideoSize: vi.fn(() => null as { width: number; height: number } | null),
    getClusterTargetWebContents: vi.fn(() => []),
    send: vi.fn(async () => true)
  }
}

beforeEach(async () => handlers.clear())

describe('cluster ipc — cluster:request', () => {
  test('enabled=false sets cluster off and resets size', async () => {
    const host = freshHost()
    registerClusterIpc(host)
    const r = await handlers.get('cluster:request')!({ sender: { id: 1 } }, false)
    expect(host.setClusterRequested).toHaveBeenCalledWith(1, false)
    expect(host.resetLastClusterVideoSize).toHaveBeenCalled()
    expect(r).toEqual({ ok: true, enabled: false })
  })

  test('enabled=false keeps the cached size while another window still requests the cluster', async () => {
    const host = freshHost()
    host.isClusterRequested.mockReturnValue(true)
    registerClusterIpc(host)
    const r = await handlers.get('cluster:request')!({ sender: { id: 1 } }, false)
    expect(host.resetLastClusterVideoSize).not.toHaveBeenCalled()
    expect(r).toEqual({ ok: true, enabled: false })
  })

  test('enabled=true with cluster off in config still resets', async () => {
    const host = freshHost()
    host.getConfig.mockReturnValue({
      dashboards: { dash3: { main: false, dash: false, aux: false } }
    } as never)
    registerClusterIpc(host)
    const r = await handlers.get('cluster:request')!({ sender: { id: 1 } }, true)
    expect(host.setClusterRequested).toHaveBeenCalledWith(1, false)
    expect(r).toEqual({ ok: true, enabled: false })
  })

  test('enabled=true with cluster on sends focus', async () => {
    const wc = { send: vi.fn() }
    const host = freshHost()
    host.getClusterTargetWebContents.mockReturnValue([wc as never])
    registerClusterIpc(host)
    const r = await handlers.get('cluster:request')!({ sender: { id: 1 } }, true)
    expect(host.send).toHaveBeenCalledWith(expect.any(SendCommand))
    expect(r).toEqual({ ok: true, enabled: true })
  })

  test('sends cluster resolution to each target when a size is cached', async () => {
    const wc = { send: vi.fn() }
    const host = freshHost()
    host.getLastClusterVideoSize.mockReturnValue({ width: 1280, height: 720 })
    host.getClusterTargetWebContents.mockReturnValue([wc as never])
    registerClusterIpc(host)
    await handlers.get('cluster:request')!({ sender: { id: 1 } }, true)
    expect(wc.send).toHaveBeenCalledWith('cluster-video-resolution', { width: 1280, height: 720 })
  })

  test('thrown wc.send is swallowed', async () => {
    const host = freshHost()
    host.getLastClusterVideoSize.mockReturnValue({ width: 1280, height: 720 })
    const wc = {
      send: vi.fn(function () {
        throw new Error('detached')
      })
    }
    host.getClusterTargetWebContents.mockReturnValue([wc as never])
    registerClusterIpc(host)
    await expect(handlers.get('cluster:request')!({ sender: { id: 1 } }, true)).resolves.toEqual({
      ok: true,
      enabled: true
    })
  })

  test('thrown host.send is swallowed', async () => {
    const host = freshHost()
    host.send.mockImplementation(function () {
      throw new Error('not started')
    })
    registerClusterIpc(host)
    await expect(handlers.get('cluster:request')!({ sender: { id: 1 } }, true)).resolves.toEqual({
      ok: true,
      enabled: true
    })
  })

  test('emits the cached cluster resolution to each target when a size is known', async () => {
    const host = freshHost()
    host.getLastClusterVideoSize.mockReturnValue({ width: 800, height: 480 })
    const wc = { send: vi.fn() }
    host.getClusterTargetWebContents.mockReturnValue([wc as never])
    registerClusterIpc(host)

    await handlers.get('cluster:request')!({ sender: { id: 1 } }, true)

    expect(wc.send).toHaveBeenCalledWith('cluster-video-resolution', { width: 800, height: 480 })
  })
})

describe('cluster ipc — cluster:repaint-nudge', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    handlers.clear()
    fromWebContents.mockReset()
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  })

  test('is a no-op off darwin', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    registerClusterIpc(freshHost())
    expect(await handlers.get('cluster:repaint-nudge')!({ sender: {} })).toEqual({ ok: false })
  })

  test('returns ok:false when no window backs the sender', async () => {
    fromWebContents.mockReturnValue(null)
    registerClusterIpc(freshHost())
    expect(await handlers.get('cluster:repaint-nudge')!({ sender: {} })).toEqual({ ok: false })
  })

  test('nudges the window size by 1px and restores it after the timeout', async () => {
    vi.useFakeTimers()
    const win = {
      isDestroyed: vi.fn(() => false),
      getSize: vi.fn(() => [800, 480]),
      setSize: vi.fn()
    }
    fromWebContents.mockReturnValue(win)
    registerClusterIpc(freshHost())

    const r = await handlers.get('cluster:repaint-nudge')!({ sender: {} })
    expect(win.setSize).toHaveBeenCalledWith(800, 481)
    expect(r).toEqual({ ok: true })

    vi.advanceTimersByTime(60)
    expect(win.setSize).toHaveBeenLastCalledWith(800, 480)
    vi.useRealTimers()
  })

  test('skips the restore when the window is destroyed before the timeout fires', async () => {
    vi.useFakeTimers()
    const win = {
      isDestroyed: vi.fn().mockReturnValueOnce(false).mockReturnValue(true),
      getSize: vi.fn(() => [800, 480]),
      setSize: vi.fn()
    }
    fromWebContents.mockReturnValue(win)
    registerClusterIpc(freshHost())

    await handlers.get('cluster:repaint-nudge')!({ sender: {} })
    expect(win.setSize).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(60)
    expect(win.setSize).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
