import { ProjectionAudio } from '@main/services/projection/services/ProjectionAudio'

vi.mock('@main/services/audio', () => ({
  Microphone: vi.fn().mockImplementation(function () {
    return {
      on: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      isCapturing: vi.fn(() => false),
      setDevice: vi.fn()
    }
  }),
  AudioOutput: vi.fn().mockImplementation(function () {
    return {
      start: vi.fn(),
      stop: vi.fn(),
      write: vi.fn(),
      setDevice: vi.fn()
    }
  }),
  downsampleToMono: vi.fn(function () {
    return new Int16Array([1, 2, 3])
  })
}))

vi.mock('@main/constants', () => ({
  DEBUG: true
}))

vi.mock('../../messages', () => ({
  decodeTypeMap: {
    1: { frequency: 48000, channel: 2, format: 'pcm', mimeType: 'audio/pcm', bitDepth: 16 },
    2: { frequency: 16000, channel: 1, format: 'pcm', mimeType: 'audio/pcm', bitDepth: 16 }
  },
  AudioData: class {}
}))

vi.mock('@shared/types/ProjectionEnums', () => ({
  AudioCommand: {
    AudioAttentionStart: 1,
    AudioAttentionRinging: 2,
    AudioPhonecallStop: 3,
    AudioVoiceAssistantStart: 4,
    AudioVoiceAssistantStop: 5,
    AudioNaviStart: 6,
    AudioTurnByTurnStart: 7,
    AudioNaviStop: 8,
    AudioTurnByTurnStop: 9,
    AudioOutputStart: 10,
    AudioMediaStart: 11,
    AudioMediaStop: 12,
    AudioOutputStop: 13,
    AudioInputConfig: 14,
    AudioPhonecallStart: 15
  }
}))

function createSubject(config: Record<string, unknown> = { mediaDelay: 120 }) {
  return new ProjectionAudio(() => config as any, vi.fn(), vi.fn(), vi.fn()) as any
}

describe('ProjectionAudio DEBUG logging', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    debugSpy.mockRestore()
    logSpy.mockRestore()
  })

  test('logs call playback writes and skips duplicate log states', () => {
    const a = createSubject()
    const player = { write: vi.fn() }
    a.getAudioOutputForStream = vi.fn(() => player)
    a.getLogicalStreamKey = vi.fn(() => 'call')

    a.handleAudioData({
      data: new Int16Array([1, 2]),
      sampleRate: 16000,
      channels: 1,
      audioType: 5
    })
    a.handleAudioData({
      data: new Int16Array([3, 4]),
      sampleRate: 16000,
      channels: 1,
      audioType: 5
    })
    a.handleAudioData({
      data: new Int16Array([5, 6]),
      sampleRate: 8000,
      channels: 1,
      audioType: 5
    })

    const callLogs = debugSpy.mock.calls.filter(
      ([m]) => m === '[ProjectionAudio] call playback write'
    )
    expect(callLogs.length).toBe(2)
  })

  test('logs non-call music data without emitting a call playback log', () => {
    const a = createSubject()
    const player = { write: vi.fn() }
    a.getAudioOutputForStream = vi.fn(() => player)
    a.getLogicalStreamKey = vi.fn(() => 'music')
    a.mediaActive = true

    a.handleAudioData({ data: new Int16Array([1, 2]), sampleRate: 48000, channels: 2 })

    const callLogs = debugSpy.mock.calls.filter(
      ([m]) => m === '[ProjectionAudio] call playback write'
    )
    expect(callLogs.length).toBe(0)
  })

  test('logs incoming audio commands', () => {
    const a = createSubject()
    a.handleAudioData({ command: 1 })
    expect(debugSpy).toHaveBeenCalledWith('[ProjectionAudio] audio command', expect.any(Object))
  })

  test('logs mic decodeType updates', () => {
    const a = createSubject()
    a.currentMicDecodeType = 1
    a._mic = { isCapturing: vi.fn(() => false), start: vi.fn(), stop: vi.fn() }

    a.handleAudioData({ command: 14, decodeType: 2 })

    expect(debugSpy).toHaveBeenCalledWith(
      '[ProjectionAudio] mic decodeType updated',
      expect.any(Object)
    )
  })

  test('logs when mic start is skipped without a decodeType', () => {
    const a = createSubject({ micType: 0, disableAudioOutput: false })
    a._mic = null
    a.currentMicDecodeType = null

    a.handleAudioData({ command: 4 })

    expect(debugSpy).toHaveBeenCalledWith(
      '[ProjectionAudio] skip mic start without decodeType',
      expect.any(Object)
    )
  })

  test('logs audio device changes', () => {
    const a = createSubject()
    a._mic = null

    a.onAudioDeviceChanged()

    expect(debugSpy).toHaveBeenCalledWith(
      '[ProjectionAudio] audio device changed, resetting streams'
    )
  })

  test('logs the creation of a new audio player', () => {
    const a = createSubject()

    a.getAudioOutputForStream('music', 1, { sampleRate: 44100, channels: 2 })

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[ProjectionAudio] new player'))
  })
})
