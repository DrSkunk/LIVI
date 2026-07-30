import type { DeviceView } from '@shared/types'
import { act, renderHook, waitFor } from '@testing-library/react'
import { forgetDevice, selectDevice, useDevices } from '../useDevices'

type Handler = (evt: unknown, ...args: unknown[]) => void

function installApi(over: Record<string, unknown> = {}): {
  getDevices: ReturnType<typeof vi.fn>
  onEvent: ReturnType<typeof vi.fn>
  offEvent: ReturnType<typeof vi.fn>
  selectDevice: ReturnType<typeof vi.fn>
  forgetDevice: ReturnType<typeof vi.fn>
  handlers: Handler[]
} {
  const handlers: Handler[] = []
  const ipc = {
    getDevices: vi.fn(async () => [] as DeviceView[]),
    onEvent: vi.fn((h: Handler) => handlers.push(h)),
    offEvent: vi.fn((h: Handler) => {
      const i = handlers.indexOf(h)
      if (i >= 0) handlers.splice(i, 1)
    }),
    selectDevice: vi.fn(async () => ({ ok: true })),
    forgetDevice: vi.fn(async () => ({ ok: true })),
    ...over
  }
  ;(window as unknown as { projection: unknown }).projection = { ipc }
  return { ...ipc, handlers } as never
}

const dev = (id: string): DeviceView => ({ id, name: id }) as unknown as DeviceView

afterEach(() => {
  delete (window as unknown as { projection?: unknown }).projection
})

describe('useDevices', () => {
  test('seeds the list from getDevices', async () => {
    const api = installApi({ getDevices: vi.fn(async () => [dev('a'), dev('b')]) })
    const { result } = renderHook(() => useDevices())
    await waitFor(() => expect(result.current).toHaveLength(2))
    expect(api.onEvent).toHaveBeenCalled()
  })

  test('updates on a devices event and ignores other event types', async () => {
    const api = installApi()
    const { result } = renderHook(() => useDevices())
    await waitFor(() => expect(api.onEvent).toHaveBeenCalled())

    act(() => api.handlers[0](null, { type: 'other', payload: [dev('x')] }))
    expect(result.current).toHaveLength(0)

    act(() => api.handlers[0](null, { type: 'devices', payload: [dev('x'), dev('y')] }))
    expect(result.current).toHaveLength(2)

    act(() => api.handlers[0](null, { type: 'devices' }))
    expect(result.current).toHaveLength(2)
  })

  test('detaches the listener on unmount', async () => {
    const api = installApi()
    const { unmount } = renderHook(() => useDevices())
    await waitFor(() => expect(api.onEvent).toHaveBeenCalled())
    unmount()
    expect(api.offEvent).toHaveBeenCalled()
  })

  test('does nothing when the ipc bridge is absent', () => {
    ;(window as unknown as { projection: unknown }).projection = { ipc: {} }
    const { result } = renderHook(() => useDevices())
    expect(result.current).toEqual([])
  })

  test('bails out when getDevices exists but onEvent is missing', () => {
    ;(window as unknown as { projection: unknown }).projection = {
      ipc: { getDevices: vi.fn(async () => [dev('a')]) }
    }
    const { result } = renderHook(() => useDevices())
    expect(result.current).toEqual([])
  })

  test('swallows a rejected getDevices', async () => {
    const api = installApi({ getDevices: vi.fn(async () => Promise.reject(new Error('boom'))) })
    const { result } = renderHook(() => useDevices())
    await waitFor(() => expect(api.getDevices).toHaveBeenCalled())
    expect(result.current).toEqual([])
  })

  test('keeps the empty list when getDevices resolves without a payload', async () => {
    const api = installApi({ getDevices: vi.fn(async () => undefined as unknown as DeviceView[]) })
    const { result } = renderHook(() => useDevices())
    await waitFor(() => expect(api.getDevices).toHaveBeenCalled())
    expect(result.current).toEqual([])
  })
})

describe('selectDevice / forgetDevice', () => {
  test('selectDevice returns the ipc result', async () => {
    installApi()
    await expect(selectDevice('a')).resolves.toEqual({ ok: true })
  })

  test('selectDevice resolves to not-ok without the bridge', async () => {
    delete (window as unknown as { projection?: unknown }).projection
    await expect(selectDevice('a')).resolves.toEqual({ ok: false })
  })

  test('selectDevice maps a rejection to not-ok', async () => {
    installApi({ selectDevice: vi.fn(async () => Promise.reject(new Error('x'))) })
    await expect(selectDevice('a')).resolves.toEqual({ ok: false })
  })

  test('forgetDevice invokes the bridge and swallows rejections', async () => {
    const api = installApi({ forgetDevice: vi.fn(async () => Promise.reject(new Error('x'))) })
    expect(() => forgetDevice('a')).not.toThrow()
    expect(api.forgetDevice).toHaveBeenCalledWith('a')
  })

  test('forgetDevice is a no-op without the bridge', () => {
    delete (window as unknown as { projection?: unknown }).projection
    expect(() => forgetDevice('a')).not.toThrow()
  })
})
