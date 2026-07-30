import { act, renderHook } from '@testing-library/react'
import { useFftPcm } from '../useFftPcm'

const setPcmDataMock = vi.fn()

vi.mock('../../store/store', () => ({
  useLiviStore: (selector: (s: { setPcmData: unknown }) => unknown) =>
    selector({ setPcmData: setPcmDataMock })
}))

const makeChunk = (samples: number[]) => {
  const int16 = new Int16Array(samples)
  return { chunk: { buffer: int16.buffer } }
}

beforeEach(() => {
  vi.useFakeTimers()
  setPcmDataMock.mockReset()
  ;(window as any).projection = undefined
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useFftPcm', () => {
  test('does nothing when the audio ipc is unavailable', () => {
    ;(window as any).projection = { ipc: {} }

    const { unmount } = renderHook(() => useFftPcm())

    unmount()
    expect(setPcmDataMock).not.toHaveBeenCalled()
  })

  test('does nothing when projection is missing entirely', () => {
    const { unmount } = renderHook(() => useFftPcm())

    unmount()
    expect(setPcmDataMock).not.toHaveBeenCalled()
  })

  test('converts Int16 chunks to Float32 and forwards them after the delay', () => {
    let handler: ((payload: unknown) => void) | undefined
    const offAudioChunk = vi.fn()
    ;(window as any).projection = {
      ipc: {
        onAudioChunk: vi.fn((cb: (payload: unknown) => void) => {
          handler = cb
        }),
        offAudioChunk
      }
    }

    const { unmount } = renderHook(() => useFftPcm(50))

    act(() => {
      handler?.(makeChunk([16384, -16384, 0]))
    })
    expect(setPcmDataMock).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(50)
    })

    expect(setPcmDataMock).toHaveBeenCalledTimes(1)
    const forwarded = setPcmDataMock.mock.calls[0][0] as Float32Array
    expect(forwarded).toBeInstanceOf(Float32Array)
    expect(Array.from(forwarded)).toEqual([0.5, -0.5, 0])

    unmount()
    expect(offAudioChunk).toHaveBeenCalledWith(handler)
  })

  test('ignores payloads that are not objects or lack a chunk buffer', () => {
    let handler: ((payload: unknown) => void) | undefined
    ;(window as any).projection = {
      ipc: {
        onAudioChunk: vi.fn((cb: (payload: unknown) => void) => {
          handler = cb
        })
      }
    }

    renderHook(() => useFftPcm())

    act(() => {
      handler?.(null)
      handler?.('nope')
      handler?.({})
      handler?.({ chunk: {} })
    })

    act(() => {
      vi.advanceTimersByTime(0)
    })

    expect(setPcmDataMock).not.toHaveBeenCalled()
  })

  test('clears pending timers on unmount when offAudioChunk is absent', () => {
    let handler: ((payload: unknown) => void) | undefined
    ;(window as any).projection = {
      ipc: {
        onAudioChunk: vi.fn((cb: (payload: unknown) => void) => {
          handler = cb
        })
      }
    }

    const { unmount } = renderHook(() => useFftPcm(100))

    act(() => {
      handler?.(makeChunk([1, 2, 3]))
    })

    unmount()

    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(setPcmDataMock).not.toHaveBeenCalled()
  })
})
