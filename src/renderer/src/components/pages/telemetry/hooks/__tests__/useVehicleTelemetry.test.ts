import { act, renderHook, waitFor } from '@testing-library/react'
import { useVehicleTelemetry } from '../useVehicleTelemetry'

describe('useVehicleTelemetry', () => {
  let onTelemetryCb: ((payload: unknown) => void) | undefined
  const onTelemetryMock = vi.fn()
  const offTelemetryMock = vi.fn()

  beforeEach(async () => {
    vi.clearAllMocks()
    onTelemetryCb = undefined
    ;(window as any).projection = {
      ipc: {
        onTelemetry: vi.fn((cb: (payload: unknown) => void) => {
          onTelemetryCb = cb
          onTelemetryMock(cb)
        }),
        offTelemetry: vi.fn((cb: (payload: unknown) => void) => {
          offTelemetryMock(cb)
        })
      }
    }
  })

  test('subscribes to telemetry on mount', async () => {
    renderHook(() => useVehicleTelemetry())

    expect((window as any).projection.ipc.onTelemetry).toHaveBeenCalledTimes(1)
    expect(onTelemetryCb).toBeDefined()
  })

  test('unsubscribes from telemetry on unmount', async () => {
    const { unmount } = renderHook(() => useVehicleTelemetry())

    const cb = onTelemetryCb
    unmount()

    expect((window as any).projection.ipc.offTelemetry).toHaveBeenCalledTimes(1)
    expect((window as any).projection.ipc.offTelemetry).toHaveBeenCalledWith(cb)
  })

  test('starts with null telemetry and stale state', async () => {
    const { result } = renderHook(() => useVehicleTelemetry())

    expect(result.current.telemetry).toBeNull()
    expect(result.current.isStale).toBe(true)
  })

  test('ignores non-object telemetry payloads', async () => {
    const { result } = renderHook(() => useVehicleTelemetry())

    act(() => {
      onTelemetryCb?.('invalid')
      onTelemetryCb?.(null)
      onTelemetryCb?.(123)
    })

    expect(result.current.telemetry).toBeNull()
    expect(result.current.isStale).toBe(true)
  })

  test('stores telemetry payload with explicit timestamp', async () => {
    const { result } = renderHook(() => useVehicleTelemetry())

    act(() => {
      onTelemetryCb?.({
        speedKph: 120,
        rpm: 3500,
        ts: Date.now()
      })
    })

    await waitFor(() => {
      expect(result.current.telemetry).toMatchObject({
        speedKph: 120,
        rpm: 3500
      })
    })

    expect(typeof result.current.telemetry?.ts).toBe('number')
    expect(result.current.isStale).toBe(false)
  })

  test('fills missing timestamp with Date.now', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(123456789)

    const { result } = renderHook(() => useVehicleTelemetry())

    act(() => {
      onTelemetryCb?.({
        speedKph: 88
      })
    })

    await waitFor(() => {
      expect(result.current.telemetry).toMatchObject({
        speedKph: 88,
        ts: 123456789
      })
    })

    nowSpy.mockRestore()
  })

  test('merges new telemetry payload into previous telemetry', async () => {
    const { result } = renderHook(() => useVehicleTelemetry())

    act(() => {
      onTelemetryCb?.({
        speedKph: 90,
        rpm: 2000,
        ts: Date.now()
      })
    })

    await waitFor(() => {
      expect(result.current.telemetry).toMatchObject({
        speedKph: 90,
        rpm: 2000
      })
    })

    act(() => {
      onTelemetryCb?.({
        fuelPct: 55,
        ts: Date.now()
      })
    })

    await waitFor(() => {
      expect(result.current.telemetry).toMatchObject({
        speedKph: 90,
        rpm: 2000,
        fuelPct: 55
      })
    })
  })

  test('reports stale when telemetry timestamp is older than 1500ms', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(5000)

    const { result } = renderHook(() => useVehicleTelemetry())

    act(() => {
      onTelemetryCb?.({
        speedKph: 100,
        ts: 3000
      })
    })

    await waitFor(() => {
      expect(result.current.telemetry).toMatchObject({
        speedKph: 100,
        ts: 3000
      })
    })

    expect(result.current.isStale).toBe(true)

    nowSpy.mockRestore()
  })

  test('reports not stale when telemetry timestamp is recent', async () => {
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(5000)

    const { result } = renderHook(() => useVehicleTelemetry())

    act(() => {
      onTelemetryCb?.({
        speedKph: 100,
        ts: 4000
      })
    })

    await waitFor(() => {
      expect(result.current.telemetry).toMatchObject({
        speedKph: 100,
        ts: 4000
      })
    })

    expect(result.current.isStale).toBe(false)

    nowSpy.mockRestore()
  })

  test('hydrates from the telemetry snapshot', async () => {
    ;(window as any).projection.ipc.getTelemetrySnapshot = vi.fn(() =>
      Promise.resolve({ speedKph: 42, rpm: 1500, ts: 1000 })
    )

    const { result } = renderHook(() => useVehicleTelemetry())

    await waitFor(() => {
      expect(result.current.telemetry).toMatchObject({ speedKph: 42, rpm: 1500 })
    })
  })

  test('ignores an empty telemetry snapshot', async () => {
    ;(window as any).projection.ipc.getTelemetrySnapshot = vi.fn(() => Promise.resolve({}))

    const { result } = renderHook(() => useVehicleTelemetry())

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.telemetry).toBeNull()
  })

  test('ignores a non-object telemetry snapshot', async () => {
    ;(window as any).projection.ipc.getTelemetrySnapshot = vi.fn(() => Promise.resolve('nope'))

    const { result } = renderHook(() => useVehicleTelemetry())

    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.telemetry).toBeNull()
  })

  test('drops a telemetry snapshot that resolves after unmount', async () => {
    let resolveSnap: (v: unknown) => void = () => {}
    ;(window as any).projection.ipc.getTelemetrySnapshot = vi.fn(
      () =>
        new Promise((res) => {
          resolveSnap = res
        })
    )

    const { result, unmount } = renderHook(() => useVehicleTelemetry())

    unmount()

    await act(async () => {
      resolveSnap({ speedKph: 10, ts: 1 })
      await Promise.resolve()
    })

    expect(result.current.telemetry).toBeNull()
  })
})
