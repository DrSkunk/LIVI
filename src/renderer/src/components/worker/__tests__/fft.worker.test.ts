const createSpectrumMock = vi.fn()
const transformMock = vi.fn()

vi.mock('../fft', () => ({
  FFT: vi.fn(function () {
    return {
      createSpectrum: createSpectrumMock,
      transform: transformMock
    }
  })
}))

describe('fft.worker', () => {
  let postedMessages: Array<{ message: any; transfer?: unknown }>
  let workerHandler: ((e: MessageEvent) => void) | undefined

  beforeEach(async () => {
    vi.resetModules()
    postedMessages = []

    createSpectrumMock.mockReset()
    transformMock.mockReset()

    createSpectrumMock.mockReturnValue(new Float64Array(16))
    ;(global as any).self = {
      postMessage: vi.fn((message: any, transfer?: unknown) => {
        postedMessages.push({ message, transfer })
      }),
      onmessage: undefined
    }

    await import('../fft.worker')
    workerHandler = (global as any).self.onmessage
  })

  test('registers worker message handler', async () => {
    expect(typeof workerHandler).toBe('function')
  })

  test('initializes fft worker state on init message', async () => {
    workerHandler?.({
      data: {
        type: 'init',
        fftSize: 8,
        points: 4,
        sampleRate: 48000
      }
    } as MessageEvent)

    const { FFT } = await import('../fft')
    expect(FFT).toHaveBeenCalledWith(8)
    expect(createSpectrumMock).toHaveBeenCalledTimes(1)
  })

  test('does nothing for pcm before init', async () => {
    workerHandler?.({
      data: {
        type: 'pcm',
        buffer: new Float32Array([0.1, 0.2, 0.3, 0.4]).buffer
      }
    } as MessageEvent)

    expect(postedMessages).toHaveLength(0)
    expect(transformMock).not.toHaveBeenCalled()
  })

  test('does not emit bins when pcm buffer is shorter than fftSize', async () => {
    workerHandler?.({
      data: {
        type: 'init',
        fftSize: 8,
        points: 4,
        sampleRate: 48000
      }
    } as MessageEvent)

    workerHandler?.({
      data: {
        type: 'pcm',
        buffer: new Float32Array([0.1, 0.2, 0.3, 0.4]).buffer
      }
    } as MessageEvent)

    expect(postedMessages).toHaveLength(0)
    expect(transformMock).not.toHaveBeenCalled()
  })

  test('processes one fft segment and posts normalized bins', async () => {
    createSpectrumMock.mockReturnValue(new Float64Array(16))

    transformMock.mockImplementation((output: Float64Array) => {
      for (let i = 0; i < output.length; i++) output[i] = 0

      // put some energy into a few bins
      output[2] = 20
      output[3] = 10
      output[4] = 16
      output[5] = 8
      output[6] = 12
      output[7] = 6
    })

    workerHandler?.({
      data: {
        type: 'init',
        fftSize: 8,
        points: 4,
        sampleRate: 48000
      }
    } as MessageEvent)

    workerHandler?.({
      data: {
        type: 'pcm',
        buffer: new Float32Array([0.2, 0.3, 0.4, 0.5, 0.4, 0.3, 0.2, 0.1]).buffer
      }
    } as MessageEvent)

    expect(transformMock).toHaveBeenCalledTimes(1)
    expect(postedMessages).toHaveLength(1)

    const payload = postedMessages[0].message
    expect(payload.type).toBe('bins')
    expect(payload.bins).toBeInstanceOf(Float32Array)
    expect(payload.bins).toHaveLength(4)

    for (const value of payload.bins as Float32Array) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  test('processes multiple fft segments from one pcm message', async () => {
    createSpectrumMock.mockReturnValue(new Float64Array(16))
    transformMock.mockImplementation((output: Float64Array) => {
      for (let i = 0; i < output.length; i++) output[i] = 0
      output[2] = 10
      output[3] = 5
    })

    workerHandler?.({
      data: {
        type: 'init',
        fftSize: 4,
        points: 3,
        sampleRate: 48000
      }
    } as MessageEvent)

    workerHandler?.({
      data: {
        type: 'pcm',
        buffer: new Float32Array([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]).buffer
      }
    } as MessageEvent)

    expect(transformMock).toHaveBeenCalledTimes(5)
    expect(postedMessages).toHaveLength(5)
  })

  test('keeps leftover samples in ring buffer across pcm messages', async () => {
    createSpectrumMock.mockReturnValue(new Float64Array(16))
    transformMock.mockImplementation((output: Float64Array) => {
      for (let i = 0; i < output.length; i++) output[i] = 0
      output[2] = 10
      output[3] = 5
    })

    workerHandler?.({
      data: {
        type: 'init',
        fftSize: 8,
        points: 4,
        sampleRate: 48000
      }
    } as MessageEvent)

    workerHandler?.({
      data: {
        type: 'pcm',
        buffer: new Float32Array([0.1, 0.2, 0.3, 0.4]).buffer
      }
    } as MessageEvent)

    expect(postedMessages).toHaveLength(0)

    workerHandler?.({
      data: {
        type: 'pcm',
        buffer: new Float32Array([0.5, 0.6, 0.7, 0.8]).buffer
      }
    } as MessageEvent)

    expect(transformMock).toHaveBeenCalledTimes(1)
    expect(postedMessages).toHaveLength(1)
  })

  test('skips frequency bins below MIN_FREQ', async () => {
    createSpectrumMock.mockReturnValue(new Float64Array(16))
    transformMock.mockImplementation((output: Float64Array) => {
      for (let i = 0; i < output.length; i++) output[i] = 1
    })

    workerHandler?.({
      data: {
        type: 'init',
        fftSize: 8,
        points: 4,
        sampleRate: 8
      }
    } as MessageEvent)

    workerHandler?.({
      data: {
        type: 'pcm',
        buffer: new Float32Array([0.2, 0.3, 0.4, 0.5, 0.4, 0.3, 0.2, 0.1]).buffer
      }
    } as MessageEvent)

    expect(transformMock).toHaveBeenCalledTimes(1)
    expect(postedMessages).toHaveLength(1)

    for (const value of postedMessages[0].message.bins as Float32Array) {
      expect(value).toBe(0)
    }
  })

  test('ignores unsupported message types', async () => {
    workerHandler?.({
      data: {
        type: 'unknown'
      }
    } as MessageEvent)

    expect(postedMessages).toHaveLength(0)
    expect(transformMock).not.toHaveBeenCalled()
  })
})
