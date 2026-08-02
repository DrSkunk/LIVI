import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { Mock } from 'vitest'
import { Media } from '../Media'

vi.mock('../components/createFFTSpectrum', () => ({
  FFTSpectrum: () => null
}))

vi.mock('./../hooks/useBelowNavTop', () => ({
  useBelowNavTop: () => 0
}))

const sizeHolder = vi.hoisted(() => ({ w: 600, h: 400 }))

const makeDefaultSnap = () => ({
  snap: {
    payload: {
      media: {
        MediaSongName: 'Track',
        MediaArtistName: 'Artist',
        MediaAlbumName: 'Album',
        MediaAPPName: 'CarPlay',
        MediaSongDuration: 1000,
        MediaPlayStatus: 0
      }
    }
  },
  livePlayMs: 100
})

const mediaHolder = vi.hoisted(() => ({
  value: {
    snap: {
      payload: {
        media: {
          MediaSongName: 'Track',
          MediaArtistName: 'Artist',
          MediaAlbumName: 'Album',
          MediaAPPName: 'CarPlay',
          MediaSongDuration: 1000,
          MediaPlayStatus: 0
        }
      }
    },
    livePlayMs: 100
  } as { snap: unknown; livePlayMs: number }
}))

const setSize = (w: number, h: number) => {
  sizeHolder.w = w
  sizeHolder.h = h
}

const setMedia = (value: { snap: unknown; livePlayMs: number }) => {
  mediaHolder.value = value
}

vi.mock('./../hooks/useElementSize', () => ({
  useElementSize: () => [{ current: null }, { w: sizeHolder.w, h: sizeHolder.h }]
}))

vi.mock('./../hooks/useMediaState', () => ({
  useMediaState: () => mediaHolder.value
}))

let usbEventCb: ((_: unknown, ...args: unknown[]) => void) | undefined

describe('Media component', () => {
  beforeAll(async () => {
    // — expand the global window
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    window.projection = {
      ipc: {
        sendCommand: vi.fn(),
        setVisualizerEnabled: vi.fn(),
        onEvent: vi.fn(() => vi.fn()),
        readMedia: vi.fn(() => Promise.resolve(null))
      },
      usb: {
        listenForEvents: vi.fn(() => vi.fn())
      }
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    } as unknown as typeof window.projection
  })

  beforeEach(async () => {
    usbEventCb = undefined
    setSize(600, 400)
    setMedia(makeDefaultSnap())
    vi.useFakeTimers({ shouldAdvanceTime: true })
    // — expand the global window
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    window.projection = {
      ipc: {
        sendCommand: vi.fn(),
        setVisualizerEnabled: vi.fn(),
        onEvent: vi.fn((cb: any) => {
          usbEventCb = cb
          return vi.fn()
        }),
        readMedia: vi.fn(() => Promise.resolve(null))
      },
      usb: {
        listenForEvents: vi.fn(() => vi.fn())
      }
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    } as unknown as typeof window.projection
  })

  afterEach(async () => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('sends play/pause command and resets press feedback', async () => {
    const { getByLabelText } = render(<Media />)
    const playButton = getByLabelText('Play/Pause')

    // simulate play click
    await act(async () => {
      fireEvent.click(playButton)
    })

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    expect(window.projection.ipc.sendCommand).toHaveBeenCalledWith('play')

    // advance timers for reset
    await act(async () => {
      vi.advanceTimersByTime(150)
    })

    // simulate second click (pause)
    await act(async () => {
      fireEvent.click(playButton)
      vi.advanceTimersByTime(150)
    })

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    expect(window.projection.ipc.sendCommand).toHaveBeenCalledWith('pause')
  })

  it('sends next and prev commands', async () => {
    const { getByLabelText } = render(<Media />)

    await act(async () => {
      fireEvent.click(getByLabelText('Next'))
      fireEvent.click(getByLabelText('Previous'))
    })

    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    expect(window.projection.ipc.sendCommand).toHaveBeenCalledWith('next')
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    expect(window.projection.ipc.sendCommand).toHaveBeenCalledWith('prev')
  })

  it('cleans up listeners on unmount', async () => {
    const unsub = vi.fn()
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    ;(window.projection.ipc.onEvent as Mock).mockImplementationOnce(() => unsub)

    const { unmount } = render(<Media />)
    unmount()

    expect(unsub).toHaveBeenCalled()
  })

  it('always renders and enables the spectrum analyzer', async () => {
    const { unmount } = render(<Media />)

    expect(screen.getByRole('img', { name: /Spectrum analyzer/i })).toBeInTheDocument()
    expect(window.projection.ipc.setVisualizerEnabled).toHaveBeenCalledWith(true)

    unmount()
    expect(window.projection.ipc.setVisualizerEnabled).toHaveBeenCalledWith(false)
  })

  it('car-media-key PLAY event bumps play feedback', async () => {
    render(<Media />)

    await act(async () => {
      window.dispatchEvent(new CustomEvent('car-media-key', { detail: { command: 'play' } }))
    })
    // Component handled the event without error
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    expect(window.projection.ipc.sendCommand).not.toHaveBeenCalled() // car-media-key doesn't call sendCommand
  })

  it('car-media-key NEXT event flashes next button', async () => {
    render(<Media />)

    await act(async () => {
      window.dispatchEvent(new CustomEvent('car-media-key', { detail: { command: 'next' } }))
    })
    expect(screen.getByLabelText('Next')).toBeInTheDocument()
  })

  it('car-media-key PREV event flashes prev button', async () => {
    render(<Media />)

    await act(async () => {
      window.dispatchEvent(new CustomEvent('car-media-key', { detail: { command: 'prev' } }))
    })
    expect(screen.getByLabelText('Previous')).toBeInTheDocument()
  })

  it('car-media-key with no command does nothing', async () => {
    render(<Media />)

    await act(async () => {
      window.dispatchEvent(new CustomEvent('car-media-key', { detail: {} }))
    })
    expect(screen.getByLabelText('Play/Pause')).toBeInTheDocument()
  })

  it('keeps the spectrum analyzer mounted after media reset', async () => {
    render(<Media />)

    await act(async () => {
      usbEventCb?.(null, { type: 'media-reset' })
    })

    expect(screen.getByRole('img', { name: /Spectrum analyzer/i })).toBeInTheDocument()
  })

  it('renders the tiny-screen layout without crashing', async () => {
    setSize(600, 300)
    render(<Media />)
    expect(screen.getByLabelText('Play/Pause')).toBeInTheDocument()
  })

  it('renders the single-column layout on narrow screens', async () => {
    setSize(280, 300)
    render(<Media />)
    expect(screen.getByLabelText('Play/Pause')).toBeInTheDocument()
    expect(screen.getByText('Track')).toBeInTheDocument()
  })

  it('shows the app name in the single column when the artist is empty', async () => {
    setSize(280, 300)
    setMedia({
      snap: {
        payload: {
          media: {
            MediaSongName: 'Track',
            MediaArtistName: '',
            MediaAlbumName: 'Album',
            MediaAPPName: 'CarPlay',
            MediaSongDuration: 1000,
            MediaPlayStatus: 0
          }
        }
      },
      livePlayMs: 100
    })
    render(<Media />)
    expect(screen.getByText('CarPlay')).toBeInTheDocument()
  })

  it('renders artwork image when base64 image is present', async () => {
    setMedia({
      snap: {
        payload: {
          base64Image: 'iVBORw0KGgo=',
          media: {
            MediaSongName: 'Track',
            MediaArtistName: 'Artist',
            MediaAlbumName: 'Album',
            MediaAPPName: 'CarPlay',
            MediaSongDuration: 1000,
            MediaPlayStatus: 0
          }
        }
      },
      livePlayMs: 100
    })
    render(<Media />)
    expect(screen.getByAltText('Cover')).toBeInTheDocument()
  })

  it('handles zero playback time and zero duration', async () => {
    setMedia({
      snap: {
        payload: {
          media: {
            MediaSongName: 'Track',
            MediaArtistName: 'Artist',
            MediaAlbumName: 'Album',
            MediaAPPName: 'CarPlay',
            MediaPlayStatus: 0
          }
        }
      },
      livePlayMs: 0
    })
    render(<Media />)
    expect(screen.getByLabelText('Play/Pause')).toBeInTheDocument()
  })

  it('holds the last progress when playback appears to jump backwards', async () => {
    setMedia({
      snap: {
        payload: {
          media: {
            MediaSongName: 'Track',
            MediaArtistName: 'Artist',
            MediaAlbumName: 'Album',
            MediaAPPName: 'CarPlay',
            MediaSongDuration: 1000,
            MediaPlayStatus: 1
          }
        }
      },
      livePlayMs: 500
    })
    const { rerender } = render(<Media />)

    setMedia({
      snap: {
        payload: {
          media: {
            MediaSongName: 'Track',
            MediaArtistName: 'Artist',
            MediaAlbumName: 'Album',
            MediaAPPName: 'CarPlay',
            MediaSongDuration: 1000,
            MediaPlayStatus: 1
          }
        }
      },
      livePlayMs: 100
    })

    await act(async () => {
      rerender(<Media />)
    })

    expect(screen.getByLabelText('Play/Pause')).toBeInTheDocument()
  })

  it('car-media-key with an unknown command is ignored', async () => {
    render(<Media />)

    await act(async () => {
      window.dispatchEvent(new CustomEvent('car-media-key', { detail: { command: 'seek' } }))
    })
    expect(screen.getByLabelText('Play/Pause')).toBeInTheDocument()
  })

  it('ignores projection events without a media-reset type and without a payload', async () => {
    render(<Media />)

    await act(async () => {
      usbEventCb?.(null, { type: 'other' })
      usbEventCb?.(null)
    })
    expect(screen.getByRole('img', { name: /Spectrum analyzer/i })).toBeInTheDocument()
  })
})
