import { act, render, screen, waitFor } from '@testing-library/react'
import type { Mock } from 'vitest'
import { Camera } from '../Camera'

let mockSettings: any = null

vi.mock('@store/store', () => ({
  useLiviStore: (selector: (s: { settings: unknown }) => unknown) =>
    selector({ settings: mockSettings })
}))

describe('pages/camera Camera', () => {
  const addEventListener = vi.fn()
  const removeEventListener = vi.fn()
  const enumerateDevices = vi.fn()
  const getUserMedia = vi.fn()

  const createStream = () => {
    const track = { stop: vi.fn(), getSettings: vi.fn(() => ({ width: 1280, height: 720 })) }
    return {
      getTracks: () => [track],
      getVideoTracks: () => [track]
    } as unknown as MediaStream
  }

  beforeEach(async () => {
    vi.clearAllMocks()
    mockSettings = { cameraId: 'cam-1', cameraMirror: false }

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        addEventListener,
        removeEventListener,
        enumerateDevices,
        getUserMedia
      }
    })

    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: vi.fn(() => Promise.resolve())
    })

    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value: vi.fn()
    })
  })

  test('opens exact configured camera', async () => {
    enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: 'cam-1' }])
    getUserMedia.mockResolvedValue(createStream())

    render(<Camera />)

    expect(screen.getByText('Opening camera…')).toBeInTheDocument()

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalled()
    })

    expect(screen.queryByText('Using fallback camera')).not.toBeInTheDocument()
    expect(addEventListener).toHaveBeenCalledWith('devicechange', expect.any(Function))
  })

  test('falls back when exact camera cannot be opened', async () => {
    enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: 'cam-1' }])
    getUserMedia.mockImplementation(async (constraints: MediaStreamConstraints) => {
      const video = constraints.video
      if (video && typeof video === 'object' && 'deviceId' in video) {
        const did = (video as MediaTrackConstraints).deviceId
        if (did && typeof did === 'object' && 'exact' in did) {
          throw new Error('exact failed')
        }
      }
      return createStream()
    })

    render(<Camera showFallbackNotice />)

    await waitFor(() => {
      expect(screen.getByText('Using fallback camera')).toBeInTheDocument()
    })

    expect(getUserMedia.mock.calls.length).toBeGreaterThan(1)
  })

  test('shows error when camera not configured and fallback disabled', async () => {
    mockSettings = { cameraId: '' }

    render(<Camera allowFallback={false} />)

    expect(await screen.findByText('No camera configured.')).toBeInTheDocument()
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  test('shows not found error when saved camera is missing and fallback disabled', async () => {
    enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: 'another' }])
    getUserMedia.mockRejectedValue(new Error('should not be used'))

    render(<Camera allowFallback={false} />)

    expect(await screen.findByText('Saved camera not found.')).toBeInTheDocument()
  })

  test('handles devicechange and cleans up stream on unmount', async () => {
    const stream = createStream()
    enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: 'cam-1' }])
    getUserMedia.mockResolvedValue(stream)

    const { unmount } = render(<Camera />)

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalled()
    })

    const deviceChangeHandler = addEventListener.mock.calls.find(
      (c) => c[0] === 'devicechange'
    )?.[1]
    expect(deviceChangeHandler).toBeTruthy()

    await act(async () => {
      await deviceChangeHandler()
    })
    expect(getUserMedia).toHaveBeenCalledTimes(2)

    unmount()

    expect(removeEventListener).toHaveBeenCalledWith('devicechange', deviceChangeHandler)
    expect(HTMLMediaElement.prototype.pause as Mock).toHaveBeenCalled()
  })

  test('discards a stream that resolves after the effect was aborted', async () => {
    const stream = createStream()
    let resolveGum: (s: MediaStream) => void = () => {}
    enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: 'cam-1' }])
    getUserMedia.mockImplementation(
      () =>
        new Promise<MediaStream>((res) => {
          resolveGum = res
        })
    )

    const { unmount } = render(<Camera />)
    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalled()
    })

    unmount()

    await act(async () => {
      resolveGum(stream)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(stream.getTracks()[0].stop as Mock).toHaveBeenCalled()
  })

  test('stays silent when openStream rejects after the effect was aborted', async () => {
    let rejectEnum: (e: unknown) => void = () => {}
    enumerateDevices.mockImplementation(
      () =>
        new Promise((_res, rej) => {
          rejectEnum = rej
        })
    )

    const { unmount } = render(<Camera />)
    await waitFor(() => {
      expect(enumerateDevices).toHaveBeenCalled()
    })

    unmount()

    await act(async () => {
      rejectEnum(new Error('late enumerate'))
      await Promise.resolve()
    })

    expect(screen.queryByText('late enumerate')).not.toBeInTheDocument()
  })

  test('surfaces an unexpected Error thrown while opening', async () => {
    enumerateDevices.mockRejectedValue(new Error('enumerate boom'))

    render(<Camera />)

    expect(await screen.findByText('enumerate boom')).toBeInTheDocument()
  })

  test('stringifies a non-Error thrown while opening', async () => {
    enumerateDevices.mockRejectedValue('plain failure')

    render(<Camera />)

    expect(await screen.findByText('plain failure')).toBeInTheDocument()
  })

  test('treats a missing settings object as no configured camera', async () => {
    mockSettings = null
    enumerateDevices.mockResolvedValue([])
    getUserMedia.mockRejectedValue(new Error('unused'))

    render(<Camera />)

    expect(await screen.findByText('No camera configured.')).toBeInTheDocument()
  })

  test('opens the exact camera with explicit width and height constraints', async () => {
    enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: 'cam-1' }])
    getUserMedia.mockResolvedValue(createStream())

    render(<Camera width={1280} height={720} />)

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalled()
    })
    expect(screen.queryByText('No Camera Found')).not.toBeInTheDocument()
  })

  test('falls back with explicit width and height constraints', async () => {
    enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: 'cam-1' }])
    getUserMedia.mockImplementation(async (constraints: MediaStreamConstraints) => {
      const video = constraints.video
      if (video && typeof video === 'object' && 'deviceId' in video) {
        const did = (video as MediaTrackConstraints).deviceId
        if (did && typeof did === 'object' && 'exact' in did) {
          throw new Error('exact failed')
        }
      }
      return createStream()
    })

    render(<Camera width={1280} height={720} showFallbackNotice />)

    await waitFor(() => {
      expect(screen.getByText('Using fallback camera')).toBeInTheDocument()
    })
  })

  test('opens the exact camera with only a height constraint', async () => {
    enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: 'cam-1' }])
    getUserMedia.mockResolvedValue(createStream())

    render(<Camera width={0} height={480} />)

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalled()
    })
  })

  test('opens the exact camera with no size constraints', async () => {
    enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: 'cam-1' }])
    getUserMedia.mockResolvedValue(createStream())

    render(<Camera width={0} />)

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalled()
    })
  })

  test('falls back with only a height constraint', async () => {
    enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: 'cam-1' }])
    getUserMedia.mockImplementation(async (constraints: MediaStreamConstraints) => {
      const video = constraints.video
      if (video && typeof video === 'object' && 'deviceId' in video) {
        const did = (video as MediaTrackConstraints).deviceId
        if (did && typeof did === 'object' && 'exact' in did) {
          throw new Error('exact failed')
        }
      }
      return createStream()
    })

    render(<Camera width={0} height={480} showFallbackNotice />)

    await waitFor(() => {
      expect(screen.getByText('Using fallback camera')).toBeInTheDocument()
    })
  })

  test('falls back with no size constraints', async () => {
    enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: 'cam-1' }])
    getUserMedia.mockImplementation(async (constraints: MediaStreamConstraints) => {
      const video = constraints.video
      if (video && typeof video === 'object' && 'deviceId' in video) {
        const did = (video as MediaTrackConstraints).deviceId
        if (did && typeof did === 'object' && 'exact' in did) {
          throw new Error('exact failed')
        }
      }
      return createStream()
    })

    render(<Camera width={0} showFallbackNotice />)

    await waitFor(() => {
      expect(screen.getByText('Using fallback camera')).toBeInTheDocument()
    })
  })

  test('tolerates a play() that returns no promise', async () => {
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: vi.fn(() => undefined)
    })
    enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: 'cam-1' }])
    getUserMedia.mockResolvedValue(createStream())

    render(<Camera />)

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalled()
    })
  })

  test('swallows a rejected play() promise', async () => {
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: vi.fn(() => Promise.reject(new Error('play blocked')))
    })
    enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: 'cam-1' }])
    getUserMedia.mockResolvedValue(createStream())

    render(<Camera />)

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalled()
    })
  })

  const trackOnlyStream = () => {
    const track = { stop: vi.fn() }
    return { getTracks: () => [track], getVideoTracks: () => [] } as unknown as MediaStream
  }

  test('opens the exact camera even when it exposes no video track', async () => {
    enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: 'cam-1' }])
    getUserMedia.mockResolvedValue(trackOnlyStream())

    render(<Camera />)

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalled()
    })
    expect(screen.queryByText('No Camera Found')).not.toBeInTheDocument()
  })

  test('falls back to a camera that exposes no video track', async () => {
    enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: 'cam-1' }])
    getUserMedia.mockImplementation(async (constraints: MediaStreamConstraints) => {
      const video = constraints.video
      if (video && typeof video === 'object' && 'deviceId' in video) {
        const did = (video as MediaTrackConstraints).deviceId
        if (did && typeof did === 'object' && 'exact' in did) {
          throw new Error('exact failed')
        }
      }
      return trackOnlyStream()
    })

    render(<Camera showFallbackNotice />)

    await waitFor(() => {
      expect(screen.getByText('Using fallback camera')).toBeInTheDocument()
    })
  })

  test('reports no camera configured when fallback also fails and none is set', async () => {
    mockSettings = { cameraId: '', cameraMirror: false }
    enumerateDevices.mockResolvedValue([])
    getUserMedia.mockRejectedValue(new Error('no fallback'))

    render(<Camera />)

    expect(await screen.findByText('No camera configured.')).toBeInTheDocument()
  })

  test('ignores devicechange events fired after unmount', async () => {
    enumerateDevices.mockResolvedValue([{ kind: 'videoinput', deviceId: 'cam-1' }])
    getUserMedia.mockResolvedValue(createStream())

    const { unmount } = render(<Camera />)
    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalled()
    })

    const handler = addEventListener.mock.calls.find((c) => c[0] === 'devicechange')?.[1]
    const callsBefore = getUserMedia.mock.calls.length

    unmount()

    await act(async () => {
      await handler()
    })

    expect(getUserMedia).toHaveBeenCalledTimes(callsBefore)
  })

  test('shows the default message when an error carries no message', async () => {
    enumerateDevices.mockRejectedValue(new Error(''))

    render(<Camera />)

    expect(await screen.findByText('No Camera Found')).toBeInTheDocument()
  })

  const videoOf = (c: HTMLElement): HTMLVideoElement => c.querySelector('video') as HTMLVideoElement

  test('defaults to an unrotated, mirrored feed', () => {
    mockSettings = { cameraId: '', cameraMirror: false }
    enumerateDevices.mockResolvedValue([])
    const { container } = render(<Camera />)
    const t = videoOf(container).style.transform
    expect(t).toContain('rotate(0deg)')
    expect(t).toContain('scaleX(-1)')
  })

  test('applies a quarter turn without mirroring when mirror is on', () => {
    mockSettings = { cameraId: '', cameraMirror: true, cameraRotation: 90 }
    enumerateDevices.mockResolvedValue([])
    const { container } = render(<Camera />)
    const video = videoOf(container)
    expect(video.style.transform).toContain('rotate(90deg)')
    expect(video.style.transform).not.toContain('scaleX(-1)')
  })

  test.each([0, 90, 180, 270] as const)('renders rotation %s°', (deg) => {
    mockSettings = { cameraId: '', cameraMirror: false, cameraRotation: deg }
    enumerateDevices.mockResolvedValue([])
    const { container } = render(<Camera />)
    expect(videoOf(container).style.transform).toContain(`rotate(${deg}deg)`)
  })
})
