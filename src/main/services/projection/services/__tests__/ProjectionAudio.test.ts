import { downsampleToMono } from '@main/services/audio'
import { ProjectionAudio } from '@main/services/projection/services/ProjectionAudio'
import type { Mock } from 'vitest'

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
  DEBUG: false
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

describe('ProjectionAudio state controls', () => {
  test('setInitialVolumes applies provided values and preserves defaults for omitted streams', async () => {
    const a = createSubject()

    a.setInitialVolumes({ music: 0.3, nav: 0.4 })

    expect(a.volumes).toEqual({
      music: 0.3,
      nav: 0.4,
      voiceAssistant: 1,
      call: 1
    })
  })

  test('setStreamVolume clamps values and ignores tiny no-op changes', async () => {
    const a = createSubject()

    a.setStreamVolume('music', 2)
    expect(a.volumes.music).toBe(1)

    a.setStreamVolume('music', -5)
    expect(a.volumes.music).toBe(0)

    a.volumes.music = 0.5
    a.setStreamVolume('music', 0.50000001)
    expect(a.volumes.music).toBe(0.5)
  })

  test('setVisualizerEnabled toggles visualizer flag', async () => {
    const a = createSubject()

    a.setVisualizerEnabled(true)
    expect(a.visualizerEnabled).toBe(true)

    a.setVisualizerEnabled(false)
    expect(a.visualizerEnabled).toBe(false)
  })

  test('visualizer is reference-counted per window', async () => {
    const a = createSubject()

    a.setVisualizerEnabled(true, 1)
    a.setVisualizerEnabled(true, 2)
    expect(a.visualizerEnabled).toBe(true)

    a.setVisualizerEnabled(false, 1)
    expect(a.visualizerEnabled).toBe(true)

    a.setVisualizerEnabled(false, 2)
    expect(a.visualizerEnabled).toBe(false)
  })

  test('resetForSessionStart clears stream/session state', async () => {
    const a = createSubject()

    a.audioPlayers.set('k', { stop: vi.fn() })
    a.voiceAssistantActive = true
    a.phonecallActive = true
    a.duckLevel = 0.2
    a.mediaActive = true
    a.audioOpenArmed = true
    a.musicRampActive = true
    a.nextMusicRampStartAt = 123
    a.lastMusicDataAt = 123
    a.lastMusicPlayerKey = '1'
    a.lastNavPlayerKey = '2'
    a.uiCallIncoming = true

    a.resetForSessionStart()

    expect(a.voiceAssistantActive).toBe(false)
    expect(a.phonecallActive).toBe(false)
    expect(a.duckLevel).toBe(1)
    expect(a.mediaActive).toBe(false)
    expect(a.audioOpenArmed).toBe(false)
    expect(a.musicRampActive).toBe(false)
    expect(a.nextMusicRampStartAt).toBe(0)
    expect(a.lastMusicDataAt).toBe(0)
    expect(a.lastMusicPlayerKey).toBeNull()
    expect(a.lastNavPlayerKey).toBeNull()
    expect(a.uiCallIncoming).toBe(false)
    expect(a.audioPlayers.size).toBe(0)
  })

  test('resetForSessionStop clears stream/session state', async () => {
    const a = createSubject()

    a.audioPlayers.set('k', { stop: vi.fn() })
    a.voiceAssistantActive = true
    a.phonecallActive = true
    a.duckLevel = 0.2
    a.mediaActive = true
    a.audioOpenArmed = true
    a.musicRampActive = true
    a.nextMusicRampStartAt = 123
    a.lastMusicDataAt = 123
    a.lastMusicPlayerKey = '1'
    a.lastNavPlayerKey = '2'
    a.uiCallIncoming = true

    a.resetForSessionStop()

    expect(a.voiceAssistantActive).toBe(false)
    expect(a.phonecallActive).toBe(false)
    expect(a.duckLevel).toBe(1)
    expect(a.mediaActive).toBe(false)
    expect(a.audioOpenArmed).toBe(false)
    expect(a.musicRampActive).toBe(false)
    expect(a.nextMusicRampStartAt).toBe(0)
    expect(a.lastMusicDataAt).toBe(0)
    expect(a.lastMusicPlayerKey).toBeNull()
    expect(a.lastNavPlayerKey).toBeNull()
    expect(a.uiCallIncoming).toBe(false)
    expect(a.audioPlayers.size).toBe(0)
  })

  test('gainFromVolume clamps invalid values and maps zero to zero', async () => {
    const a = createSubject()

    expect(a.gainFromVolume(-1)).toBe(0)
    expect(a.gainFromVolume(Number.NaN)).toBe(0)
    expect(a.gainFromVolume(0)).toBe(0)
    expect(a.gainFromVolume(1)).toBeCloseTo(1, 5)
  })

  test('applyGain returns original pcm for unity or invalid gain', async () => {
    const a = createSubject()
    const pcm = new Int16Array([100, -200])

    expect(a.applyGain(pcm, 1)).toBe(pcm)
    expect(a.applyGain(pcm, Number.NaN)).toBe(pcm)
  })

  test('applyGain returns silent buffer for zero or negative gain', async () => {
    const a = createSubject()
    const pcm = new Int16Array([100, -200])

    expect(Array.from(a.applyGain(pcm, 0))).toEqual([0, 0])
    expect(Array.from(a.applyGain(pcm, -1))).toEqual([0, 0])
  })

  test('applyGain scales and clamps pcm values', async () => {
    const a = createSubject()
    const pcm = new Int16Array([20000, -20000, 1000])

    expect(Array.from(a.applyGain(pcm, 2))).toEqual([32767, -32768, 2000])
  })

  test('getLogicalStreamKey routes nav by audioType, prioritizes call over voiceAssistant', async () => {
    const a = createSubject()

    expect(a.getLogicalStreamKey({})).toBe('music')

    a.navAudioType = 4
    expect(a.getLogicalStreamKey({ audioType: 4 })).toBe('nav')

    a.voiceAssistantActive = true
    expect(a.getLogicalStreamKey({})).toBe('voiceAssistant')

    a.phonecallActive = true
    expect(a.getLogicalStreamKey({})).toBe('call')
  })

  test('getAudioOutputForStream returns null for a message without a sample rate', async () => {
    const a = createSubject()

    const out = a.getAudioOutputForStream('music', 1, {})

    expect(out).toBeNull()
  })

  test('getAudioOutputForStream creates and reuses players by (logicalKey, audioType, rate, channels)', async () => {
    const a = createSubject()

    const musicA = a.getAudioOutputForStream('music', 1, { sampleRate: 44100, channels: 2 })
    const musicB = a.getAudioOutputForStream('music', 1, { sampleRate: 44100, channels: 2 })
    const musicC = a.getAudioOutputForStream('music', 1, { sampleRate: 48000, channels: 2 })
    // Same format but different audioType → separate sink-input.
    const navSameFormat = a.getAudioOutputForStream('nav', 2, { sampleRate: 44100, channels: 2 })

    expect(musicA).toBeTruthy()
    expect(musicB).toBe(musicA)
    expect(musicC).not.toBe(musicA)
    expect(navSameFormat).not.toBe(musicA)
    expect(a.audioPlayers.size).toBe(3)
  })

  test('handleAudioData writes music pcm even when media is inactive', async () => {
    const a = createSubject()
    const player = { write: vi.fn() }
    a.getAudioOutputForStream = vi.fn(() => player)
    a.getLogicalStreamKey = vi.fn(() => 'music')
    a.mediaActive = false

    a.handleAudioData({
      data: new Int16Array([1, 2, 3]),
      sampleRate: 44100,
      channels: 2
    })

    expect(player.write).toHaveBeenCalled()
  })

  test('handleAudioData writes pcm for nav-only playback when media is inactive', async () => {
    const a = createSubject()
    const player = { write: vi.fn() }
    a.getAudioOutputForStream = vi.fn(() => player)
    a.getLogicalStreamKey = vi.fn(() => 'nav')
    a.mediaActive = false
    a.navActive = false

    a.handleAudioData({
      data: new Int16Array([1, 2, 3]),
      sampleRate: 44100,
      channels: 2
    })

    expect(player.write).toHaveBeenCalled()
  })

  test('handleAudioData writes nav PCM to its own player even when media is active', async () => {
    // The OS sink mixes the nav stream with the music stream natively, so we
    // just write to the nav player directly and let the OS handle the mix.
    const a = createSubject()
    const player = { write: vi.fn() }
    a.getAudioOutputForStream = vi.fn(() => player)
    a.getLogicalStreamKey = vi.fn(() => 'nav')
    a.mediaActive = true
    a.navActive = true

    a.handleAudioData({
      data: new Int16Array([1, 2, 3]),
      sampleRate: 44100,
      channels: 2
    })

    expect(player.write).toHaveBeenCalled()
  })

  test('handleAudioData sends audioInfo only once when metadata is present', async () => {
    const sendProjectionEvent = vi.fn()
    const a = new ProjectionAudio(
      () => ({ mediaDelay: 120 }) as any,
      sendProjectionEvent,
      vi.fn(),
      vi.fn()
    ) as any

    const player = { write: vi.fn() }
    a.getAudioOutputForStream = vi.fn(() => player)
    a.getLogicalStreamKey = vi.fn(() => 'nav')
    a.mediaActive = false

    a.handleAudioData({
      data: new Int16Array([1, 2]),
      sampleRate: 44100,
      channels: 2
    })

    a.handleAudioData({
      data: new Int16Array([3, 4]),
      sampleRate: 44100,
      channels: 2
    })

    const audioInfoCalls = sendProjectionEvent.mock.calls.filter(
      ([arg]) => arg?.type === 'audioInfo'
    )
    expect(audioInfoCalls).toHaveLength(1)
  })

  test('handleAudioData AudioOutputStart arms media open and resets music ramp state', async () => {
    const a = createSubject()

    a.mediaActive = false
    a.handleAudioData({ command: 10 })

    expect(a.audioOpenArmed).toBe(true)
    expect(a.mediaActive).toBe(false)
    expect(a.musicRampActive).toBe(false)
    expect(a.musicFade.current).toBe(0)
    expect(a.musicFade.target).toBe(1)
  })

  test('handleAudioData AudioMediaStart implicitly starts media when not armed', async () => {
    const a = createSubject()

    const before = Date.now()
    a.handleAudioData({ command: 11 })

    expect(a.mediaActive).toBe(true)
    expect(a.audioOpenArmed).toBe(false)
    expect(a.musicGateMuted).toBe(true)
    expect(a.nextMusicRampStartAt).toBeGreaterThanOrEqual(before - 5)
  })

  test('handleAudioData AudioMediaStart consumes open arm and starts media', async () => {
    const a = createSubject()
    a.audioOpenArmed = true

    a.handleAudioData({ command: 11 })

    expect(a.audioOpenArmed).toBe(false)
    expect(a.mediaActive).toBe(true)
    expect(a.musicGateMuted).toBe(true)
  })

  test('handleAudioData AudioMediaStop deactivates media and clears music player', async () => {
    const a = createSubject()
    a.mediaActive = true
    a.audioOpenArmed = true
    a.lastMusicPlayerKey = 'music-key'
    a.stopPlayerByKey = vi.fn()

    a.handleAudioData({ command: 12 })

    expect(a.mediaActive).toBe(false)
    expect(a.audioOpenArmed).toBe(false)
    expect(a.stopPlayerByKey).toHaveBeenCalledWith('music-key')
    expect(a.lastMusicPlayerKey).toBeNull()
  })

  test('handleAudioData nav start learns nav routing and raises the UI hint', async () => {
    const a = createSubject()

    a.handleAudioData({ command: 6, audioType: 4 })

    expect(a.navAudioType).toBe(4)
    expect(a.uiNavHintActive).toBe(true)
  })

  test('handleAudioData nav stop removes nav-only player when media inactive', async () => {
    const a = createSubject()
    a.mediaActive = false
    a.lastNavPlayerKey = 'nav-key'
    a.stopPlayerByKey = vi.fn()

    a.handleAudioData({ command: 8 })

    expect(a.stopPlayerByKey).toHaveBeenCalledWith('nav-key')
    expect(a.lastNavPlayerKey).toBeNull()
  })

  test('handleAudioData AudioOutputStop stops remembered players when no call or voiceAssistant is active', async () => {
    const a = createSubject()
    a.lastMusicPlayerKey = 'music'
    a.lastNavPlayerKey = 'nav'
    a.lastVoiceAssistantPlayerKey = 'voiceAssistant'
    a.lastCallPlayerKey = 'call'
    a.stopPlayerByKey = vi.fn()

    a.handleAudioData({ command: 13 })

    expect(a.stopPlayerByKey).toHaveBeenCalledWith('music')
    expect(a.stopPlayerByKey).toHaveBeenCalledWith('nav')
    expect(a.stopPlayerByKey).toHaveBeenCalledWith('voiceAssistant')
    expect(a.stopPlayerByKey).toHaveBeenCalledWith('call')
    expect(a.lastMusicPlayerKey).toBeNull()
    expect(a.lastNavPlayerKey).toBeNull()
    expect(a.lastVoiceAssistantPlayerKey).toBeNull()
    expect(a.lastCallPlayerKey).toBeNull()
  })

  test('handleAudioData AudioInputConfig updates current mic decode type', async () => {
    const a = createSubject()

    a.handleAudioData({ command: 14, decodeType: 2 })

    expect(a.currentMicDecodeType).toBe(2)
  })

  test('handleAudioData AudioVoiceAssistantStart updates voiceAssistant state and skips mic start without decodeType', async () => {
    const a = createSubject({ micType: 0, disableAudioOutput: false })

    a.handleAudioData({ command: 4 })

    expect(a.voiceAssistantActive).toBe(true)
    expect(a.phonecallActive).toBe(false)
    expect(a.currentMicDecodeType).toBeNull()
  })

  test('handleAudioData AudioPhonecallStart updates phone state and stops mic in transfer mode', async () => {
    const a = createSubject({ micType: 1, disableAudioOutput: true })
    a._mic = { stop: vi.fn() }

    a.handleAudioData({ command: 15, decodeType: 1 })

    expect(a.phonecallActive).toBe(true)
    expect(a.voiceAssistantActive).toBe(false)
    expect(a._mic.stop).toHaveBeenCalled()
  })

  test('handleAudioData AudioVoiceAssistantStop clears state and stops player/mic', async () => {
    const a = createSubject()
    a.voiceAssistantActive = true
    a.lastVoiceAssistantPlayerKey = 'va-key'
    a.stopPlayerByKey = vi.fn()
    a._mic = { stop: vi.fn() }

    a.handleAudioData({ command: 5 })

    expect(a.voiceAssistantActive).toBe(false)
    expect(a.stopPlayerByKey).toHaveBeenCalledWith('va-key')
    expect(a.lastVoiceAssistantPlayerKey).toBeNull()
    expect(a._mic.stop).toHaveBeenCalled()
  })

  test('handleAudioData AudioPhonecallStop clears phone state and stops mic', async () => {
    const a = createSubject()
    a.phonecallActive = true
    a._mic = { stop: vi.fn() }

    a.handleAudioData({ command: 3 })

    expect(a.phonecallActive).toBe(false)
    expect(a._mic.stop).toHaveBeenCalled()
  })

  test('handleAudioData AudioAttentionStart sets uiCallIncoming and emits attention', async () => {
    const emitAttention = vi.fn()
    const a = createSubject()
    a.emitAttention = emitAttention
    a.uiCallIncoming = false

    a.handleAudioData({ command: 1 }) // AudioAttentionStart

    expect(a.uiCallIncoming).toBe(true)
    expect(emitAttention).toHaveBeenCalledWith('call', true, { phase: 'incoming' })
  })

  test('handleAudioData AudioAttentionStart does not re-emit when uiCallIncoming already true', async () => {
    const emitAttention = vi.fn()
    const a = createSubject()
    a.emitAttention = emitAttention
    a.uiCallIncoming = true

    a.handleAudioData({ command: 1 })

    expect(emitAttention).not.toHaveBeenCalled()
  })

  test('handleAudioData AudioAttentionRinging also sets uiCallIncoming', async () => {
    const emitAttention = vi.fn()
    const a = createSubject()
    a.emitAttention = emitAttention
    a.uiCallIncoming = false

    a.handleAudioData({ command: 2 }) // AudioAttentionRinging

    expect(a.uiCallIncoming).toBe(true)
    expect(emitAttention).toHaveBeenCalledWith('call', true, { phase: 'incoming' })
  })

  test('handleAudioData AudioPhonecallStop emits attention ended when uiCallIncoming is true', async () => {
    const emitAttention = vi.fn()
    const a = createSubject()
    a.emitAttention = emitAttention
    a.uiCallIncoming = true
    a._mic = { stop: vi.fn() }

    a.handleAudioData({ command: 3 }) // AudioPhonecallStop

    expect(a.uiCallIncoming).toBe(false)
    expect(emitAttention).toHaveBeenCalledWith('call', false, { phase: 'ended' })
  })

  test('handleAudioData AudioNaviStop emits attention nav:false when uiNavHintActive is true', async () => {
    const emitAttention = vi.fn()
    const a = createSubject()
    a.emitAttention = emitAttention
    a.uiNavHintActive = true
    a.navActive = true
    a.lastNavPlayerKey = null
    a.stopPlayerByKey = vi.fn()

    a.handleAudioData({ command: 8 }) // AudioNaviStop

    expect(a.uiNavHintActive).toBe(false)
    expect(emitAttention).toHaveBeenCalledWith('nav', false)
  })

  test('handleAudioData AudioOutputStart does nothing when mediaActive is already true', async () => {
    const a = createSubject()
    a.mediaActive = true
    a.audioOpenArmed = false

    a.handleAudioData({ command: 10 }) // AudioOutputStart

    // mediaActive stays true and audioOpenArmed remains unchanged
    expect(a.mediaActive).toBe(true)
    expect(a.audioOpenArmed).toBe(false)
  })

  test('handleAudioData AudioMediaStart returns early when audioOpenArmed and mediaActive both true', async () => {
    const a = createSubject()
    a.audioOpenArmed = true
    a.mediaActive = true

    // Should return early at line 612 (mediaActive true inside audioOpenArmed branch)
    a.handleAudioData({ command: 11 }) // AudioMediaStart

    // mediaActive should still be true (unchanged)
    expect(a.mediaActive).toBe(true)
    expect(a.audioOpenArmed).toBe(true)
  })

  test('handleAudioData AudioNaviStop with mediaActive=true does not stop nav player', async () => {
    const a = createSubject()
    a.mediaActive = true // music still playing — let the OS sink drain nav tail naturally
    a.lastNavPlayerKey = 'nav-key'
    a.stopPlayerByKey = vi.fn()

    a.handleAudioData({ command: 8 }) // AudioNaviStop

    // With mediaActive=true, stopPlayerByKey should NOT be called (else branch)
    expect(a.stopPlayerByKey).not.toHaveBeenCalled()
    expect(a.lastNavPlayerKey).toBe('nav-key')
  })

  test('handleAudioData AudioInputConfig restarts mic when decodeType changes and mic is capturing', async () => {
    const a = createSubject()
    a.currentMicDecodeType = 1
    a._mic = { isCapturing: vi.fn(() => true), start: vi.fn(), stop: vi.fn() }

    a.handleAudioData({ command: 14, decodeType: 2 }) // decodeType changed from 1 to 2

    expect(a.currentMicDecodeType).toBe(2)
    expect(a._mic.start).toHaveBeenCalledWith(2)
  })

  test('handleAudioData AudioInputConfig does not restart mic when decodeType unchanged', async () => {
    const a = createSubject()
    a.currentMicDecodeType = 2
    a._mic = { isCapturing: vi.fn(() => true), start: vi.fn(), stop: vi.fn() }

    a.handleAudioData({ command: 14, decodeType: 2 }) // same decodeType

    expect(a._mic.start).not.toHaveBeenCalled()
  })

  test('handleAudioData AudioVoiceAssistantStart with micType=0 creates mic and starts it with decodeType', async () => {
    const { Microphone } = await import('@main/services/audio')

    const a = createSubject({ micType: 0, disableAudioOutput: false })
    a._mic = null

    a.handleAudioData({ command: 4, decodeType: 1 }) // AudioVoiceAssistantStart with decodeType

    expect(Microphone).toHaveBeenCalled()
    expect(a._mic).not.toBeNull()
    expect(a._mic.start).toHaveBeenCalledWith(1)
    expect(a.currentMicDecodeType).toBe(1)
  })

  test('handleAudioData AudioVoiceAssistantStart skips mic.start when no decodeType available', async () => {
    const a = createSubject({ micType: 0, disableAudioOutput: false })
    a._mic = null
    a.currentMicDecodeType = null

    a.handleAudioData({ command: 4 }) // AudioVoiceAssistantStart, no decodeType in msg

    expect(a.voiceAssistantActive).toBe(true)
    // mic is created but start is NOT called (no decode type)
    expect(a._mic).not.toBeNull()
    expect(a._mic.start).not.toHaveBeenCalled()
  })

  test('handleAudioData AudioVoiceAssistantStart reuses existing mic and sets decodeType from msg', async () => {
    const existingMic = { on: vi.fn(), start: vi.fn(), stop: vi.fn(), isCapturing: vi.fn() }
    const a = createSubject({ micType: 0, disableAudioOutput: false })
    a._mic = existingMic
    a.currentMicDecodeType = 1

    a.handleAudioData({ command: 4, decodeType: 2 })

    expect(a.currentMicDecodeType).toBe(2)
    expect(existingMic.start).toHaveBeenCalledWith(2)
  })

  test('handleAudioData with pcm data and visualizerEnabled sends chunked audio', async () => {
    const sendChunked = vi.fn()
    const { ProjectionAudio } = await import('@main/services/projection/services/ProjectionAudio')
    const a = new ProjectionAudio(
      () => ({ mediaDelay: 120 }) as any,
      vi.fn(),
      sendChunked,
      vi.fn()
    ) as any

    const player = { write: vi.fn() }
    a.getAudioOutputForStream = vi.fn(() => player)
    a.getLogicalStreamKey = vi.fn(() => 'music')
    a.mediaActive = true
    a.setVisualizerEnabled(true)

    a.handleAudioData({ data: new Int16Array([1, 2, 3]), decodeType: 1 })

    const [, buf] = sendChunked.mock.calls[0]
    expect(Object.prototype.toString.call(buf)).toBe('[object ArrayBuffer]')
    expect(sendChunked).toHaveBeenCalledWith(
      'projection-audio-chunk',
      expect.anything(),
      64 * 1024,
      expect.objectContaining({ channels: 1 })
    )
  })

  test('stopAllAudioPlayers is called during reset and stops all players ignoring errors', async () => {
    const a = createSubject()
    const throwingPlayer = {
      stop: vi.fn(function () {
        throw new Error('stop failed')
      })
    }
    const goodPlayer = { stop: vi.fn() }

    a.audioPlayers.set('48000:2', throwingPlayer)
    a.audioPlayers.set('16000:1', goodPlayer)

    // Should not throw even when player.stop() throws
    expect(() => a.resetForSessionStart()).not.toThrow()

    expect(throwingPlayer.stop).toHaveBeenCalled()
    expect(goodPlayer.stop).toHaveBeenCalled()
    expect(a.audioPlayers.size).toBe(0)
  })

  test('handleAudioData with music data drops the chunk when mediaActive=false', async () => {
    const a = createSubject()
    a.mediaActive = false
    const player = { write: vi.fn(), stop: vi.fn() }
    a.audioPlayers.set('music:at1:48000:2', player)
    a.handleAudioData({
      audioType: 1,
      decodeType: 1,
      data: new Int16Array(8)
    })
    expect(player.write).not.toHaveBeenCalled()
  })

  test('getAudioOutputForStream returns null for a message missing channels', async () => {
    const a = createSubject()
    const player = a.getAudioOutputForStream('music', 1, { sampleRate: 44100 })
    expect(player).toBeNull()
  })

  test('handleAudioData with a rate-less message is a silent no-op', async () => {
    const a = createSubject()
    a.mediaActive = true
    expect(() =>
      a.handleAudioData({
        audioType: 1,
        data: new Int16Array(8)
      })
    ).not.toThrow()
  })

  test('stopPlayerByKey swallows errors when player.stop throws', async () => {
    const a = createSubject()
    const badPlayer = {
      stop: vi.fn(function () {
        throw new Error('stop error')
      })
    }
    a.audioPlayers.set('48000:2', badPlayer)

    expect(() => a.stopPlayerByKey('48000:2')).not.toThrow()
    expect(a.audioPlayers.size).toBe(0)
  })

  describe('handleAudioData — music gain, ducking and ramps', () => {
    function musicSubject() {
      const a = createSubject()
      const player = { write: vi.fn() }
      a.getAudioOutputForStream = vi.fn(() => player)
      a.getLogicalStreamKey = vi.fn(() => 'music')
      a.mediaActive = true
      return { a, player }
    }

    test('writes music PCM in steady state when not ducking', () => {
      const { a, player } = musicSubject()
      a.handleAudioData({ data: new Int16Array([100, -100]), decodeType: 1 })
      expect(player.write).toHaveBeenCalledTimes(1)
      expect(a.musicRampActive).toBe(false)
    })

    test('ducks music down after duck() is called (starts a ramp)', () => {
      const { a, player } = musicSubject()
      a.duck(0.2, 500)
      a.handleAudioData({ data: new Int16Array([1000, -1000, 500, -500]), decodeType: 1 })
      expect(a.musicRampActive).toBe(true)
      expect(a.musicFade.target).toBe(0.2)
      expect(player.write).toHaveBeenCalledTimes(1)
    })

    test('mutes music while gated by a pending ramp start', () => {
      const { a, player } = musicSubject()
      a.nextMusicRampStartAt = Date.now() + 10_000
      a.handleAudioData({ data: new Int16Array([2000, -2000]), decodeType: 1 })
      expect(a.musicGateMuted).toBe(true)
      expect(Array.from(player.write.mock.calls[0][0] as Int16Array)).toEqual([0, 0])
    })

    test('ramps music up from zero after the gate releases', () => {
      const { a } = musicSubject()
      a.musicGateMuted = true
      a.nextMusicRampStartAt = 0
      a.handleAudioData({ data: new Int16Array([3000, -3000, 1500, -1500]), decodeType: 1 })
      expect(a.musicGateMuted).toBe(false)
      expect(a.musicRampActive).toBe(true)
      expect(a.musicFade.current).toBeGreaterThanOrEqual(0)
    })

    test('restores music gain to 1 once nav releases past the hold window', () => {
      const { a } = musicSubject()
      // start ducked
      a.navActive = true
      a.handleAudioData({ data: new Int16Array([800, -800]), decodeType: 1 })
      // nav released, hold window already elapsed → ramp back to 1
      a.navActive = false
      a.navHoldUntil = 0
      a.handleAudioData({ data: new Int16Array([800, -800]), decodeType: 1 })
      expect(a.musicFade.target).toBe(1)
    })

    test('starts a fresh ramp when target already matches but current has drifted', () => {
      const { a } = musicSubject()
      a.duckLevel = 0.2
      a.musicFade = { current: 1, target: 0.2, remainingSamples: 0 }
      a.musicRampActive = false
      a.musicGateMuted = false
      a.nextMusicRampStartAt = 0
      a.musicWarmupUntil = 0

      a.handleAudioData({
        data: new Int16Array([100, -100, 100, -100]),
        sampleRate: 48000,
        channels: 2
      })

      expect(a.musicRampActive).toBe(true)
      expect(a.musicFade.remainingSamples).toBeGreaterThan(0)
    })

    test('clamps ramped music samples that overshoot the pcm range', () => {
      const { a, player } = musicSubject()
      a.volumes.music = 1
      a.duckLevel = 0.2
      a.musicFade = { current: 1.5, target: 0.2, remainingSamples: 100 }
      a.musicRampActive = true
      a.musicGateMuted = false
      a.nextMusicRampStartAt = 0
      a.musicWarmupUntil = 0

      a.handleAudioData({
        data: new Int16Array([32767, -32768]),
        sampleRate: 48000,
        channels: 2
      })

      const out = player.write.mock.calls[0][0] as Int16Array
      expect(out[0]).toBe(32767)
      expect(out[1]).toBe(-32768)
    })

    test('completes the ramp and settles gain when remaining samples run out mid-chunk', () => {
      const { a } = musicSubject()
      a.volumes.music = 1
      a.duckLevel = 0.5
      a.musicFade = { current: 1, target: 0.5, remainingSamples: 1 }
      a.musicRampActive = true
      a.musicGateMuted = false
      a.nextMusicRampStartAt = 0
      a.musicWarmupUntil = 0

      a.handleAudioData({
        data: new Int16Array([100, -100, 100, -100]),
        sampleRate: 48000,
        channels: 2
      })

      expect(a.musicRampActive).toBe(false)
      expect(a.musicFade.current).toBe(0.5)
      expect(a.musicFade.remainingSamples).toBe(0)
    })
  })

  test('setStreamVolume ignores an empty stream key', async () => {
    const a = createSubject()
    const before = { ...a.volumes }
    a.setStreamVolume('' as any, 0.5)
    expect(a.volumes).toEqual(before)
  })

  test('unduck resets duck level to unity with the given ramp duration', async () => {
    const a = createSubject()
    a.duckLevel = 0.3
    a.unduck(300)
    expect(a.duckLevel).toBe(1)
    expect(a.duckRampMs).toBe(300)
  })

  test('unduck clamps negative durations to zero', async () => {
    const a = createSubject()
    a.unduck(-50)
    expect(a.duckLevel).toBe(1)
    expect(a.duckRampMs).toBe(0)
  })

  test('restoreDuck clamps level, resets fade and clears gate state', async () => {
    const a = createSubject()
    a.musicGateMuted = true
    a.musicRampActive = true
    a.nextMusicRampStartAt = 999
    a.musicWarmupUntil = 999

    a.restoreDuck(2, -10)

    expect(a.duckLevel).toBe(1)
    expect(a.duckRampMs).toBe(0)
    expect(a.musicGateMuted).toBe(false)
    expect(a.musicRampActive).toBe(false)
    expect(a.musicFade).toEqual({ current: 1, target: 1, remainingSamples: 0 })
    expect(a.nextMusicRampStartAt).toBe(0)
    expect(a.musicWarmupUntil).toBe(0)
  })

  test('handleAudioData remembers the voiceAssistant player key for data streams', async () => {
    const a = createSubject()
    const player = { write: vi.fn() }
    a.getAudioOutputForStream = vi.fn(() => player)
    a.getLogicalStreamKey = vi.fn(() => 'voiceAssistant')

    a.handleAudioData({
      data: new Int16Array([1, 2]),
      sampleRate: 48000,
      channels: 2,
      audioType: 9
    })

    expect(a.lastVoiceAssistantPlayerKey).toBe('voiceAssistant:at9:48000:2')
  })

  test('handleAudioData remembers the call player key for data streams', async () => {
    const a = createSubject()
    const player = { write: vi.fn() }
    a.getAudioOutputForStream = vi.fn(() => player)
    a.getLogicalStreamKey = vi.fn(() => 'call')

    a.handleAudioData({ data: new Int16Array([1, 2]), sampleRate: 48000, channels: 2 })

    expect(a.lastCallPlayerKey).toBe('call:at0:48000:2')
  })

  test('handleAudioData AudioMediaStart learns the music audioType', async () => {
    const a = createSubject()
    a.audioOpenArmed = true

    a.handleAudioData({ command: 11, audioType: 7 })

    expect(a.musicAudioType).toBe(7)
  })

  test('getLogicalStreamKey routes music by learned music audioType', async () => {
    const a = createSubject()
    a.musicAudioType = 3
    expect(a.getLogicalStreamKey({ audioType: 3 })).toBe('music')
  })

  test('stopPlayerByKey ignores a null key', async () => {
    const a = createSubject()
    expect(() => a.stopPlayerByKey(null)).not.toThrow()
  })

  test('stopPlayerByKey ignores an unknown key', async () => {
    const a = createSubject()
    expect(() => a.stopPlayerByKey('does-not-exist')).not.toThrow()
  })

  test('mic data handler forwards pcm and guards empty buffers and missing decodeType', async () => {
    const sendMicPcm = vi.fn()
    const a = new ProjectionAudio(
      () => ({ micType: 0, disableAudioOutput: false }) as any,
      vi.fn(),
      vi.fn(),
      sendMicPcm
    ) as any
    a._mic = null

    a.handleAudioData({ command: 4, decodeType: 1 })

    const dataHandler = a._mic.on.mock.calls.find(([e]: [string]) => e === 'data')?.[1]

    dataHandler(null)
    dataHandler(Buffer.alloc(0))
    expect(sendMicPcm).not.toHaveBeenCalled()

    a.currentMicDecodeType = null
    dataHandler(Buffer.from([1, 2, 3, 4]))
    expect(sendMicPcm).not.toHaveBeenCalled()

    a.currentMicDecodeType = 1
    dataHandler(Buffer.from([1, 2, 3, 4]))
    expect(sendMicPcm).toHaveBeenCalledWith(expect.any(Int16Array), 1)
  })

  test('mic data handler swallows sendMicPcm errors', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const sendMicPcm = vi.fn(() => {
      throw new Error('send failed')
    })
    const a = new ProjectionAudio(
      () => ({ micType: 0, disableAudioOutput: false }) as any,
      vi.fn(),
      vi.fn(),
      sendMicPcm
    ) as any
    a._mic = null

    a.handleAudioData({ command: 4, decodeType: 1 })
    const dataHandler = a._mic.on.mock.calls.find(([e]: [string]) => e === 'data')?.[1]
    a.currentMicDecodeType = 1

    expect(() => dataHandler(Buffer.from([1, 2, 3, 4]))).not.toThrow()
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  test('onAudioDeviceChanged stops players and restarts a capturing mic', async () => {
    const a = createSubject()
    a.audioPlayers.set('k', { stop: vi.fn() })
    const mic = {
      isCapturing: vi.fn(() => true),
      stop: vi.fn(),
      setDevice: vi.fn(),
      start: vi.fn()
    }
    a._mic = mic
    a.currentMicDecodeType = 2

    a.onAudioDeviceChanged()

    expect(a.audioPlayers.size).toBe(0)
    expect(mic.stop).toHaveBeenCalled()
    expect(mic.setDevice).toHaveBeenCalled()
    expect(mic.start).toHaveBeenCalledWith(2)
  })

  test('onAudioDeviceChanged does not restart a mic that was not capturing', async () => {
    const a = createSubject()
    const mic = {
      isCapturing: vi.fn(() => false),
      stop: vi.fn(),
      setDevice: vi.fn(),
      start: vi.fn()
    }
    a._mic = mic
    a.currentMicDecodeType = 2

    a.onAudioDeviceChanged()

    expect(mic.stop).toHaveBeenCalled()
    expect(mic.start).not.toHaveBeenCalled()
  })

  test('onAudioDeviceChanged is a no-op for the mic when none exists', async () => {
    const a = createSubject()
    a._mic = null
    expect(() => a.onAudioDeviceChanged()).not.toThrow()
  })

  test('musicGapResetMs uses the shorter reset window on non-darwin platforms', async () => {
    const original = process.platform
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    try {
      const a = createSubject()
      expect(a.musicGapResetMs).toBe(500)
    } finally {
      Object.defineProperty(process, 'platform', { value: original, configurable: true })
    }
  })

  test('setInitialVolumes fills voiceAssistant and call while preserving omitted music and nav', async () => {
    const a = createSubject()
    a.setInitialVolumes({ voiceAssistant: 0.5, call: 0.6 })
    expect(a.volumes).toEqual({ music: 1, nav: 1, voiceAssistant: 0.5, call: 0.6 })
  })

  test('setStreamVolume treats a non-finite volume as zero', async () => {
    const a = createSubject()
    a.volumes.music = 0.5
    a.setStreamVolume('music', Number.NaN)
    expect(a.volumes.music).toBe(0)
  })

  test('handleAudioData ignores messages that carry neither data nor command', async () => {
    const a = createSubject()
    const player = { write: vi.fn() }
    a.getAudioOutputForStream = vi.fn(() => player)
    expect(() => a.handleAudioData({})).not.toThrow()
    expect(player.write).not.toHaveBeenCalled()
  })

  test('handleAudioData skips visualizer chunking when the downsampled buffer is empty', async () => {
    ;(downsampleToMono as unknown as Mock).mockReturnValueOnce(new Int16Array(0))
    const sendChunked = vi.fn()
    const a = new ProjectionAudio(
      () => ({ mediaDelay: 120 }) as any,
      vi.fn(),
      sendChunked,
      vi.fn()
    ) as any
    const player = { write: vi.fn() }
    a.getAudioOutputForStream = vi.fn(() => player)
    a.getLogicalStreamKey = vi.fn(() => 'music')
    a.mediaActive = true
    a.setVisualizerEnabled(true)

    a.handleAudioData({ data: new Int16Array([1, 2, 3]), sampleRate: 48000, channels: 2 })

    expect(sendChunked).not.toHaveBeenCalled()
  })

  test('handleAudioData VoiceAssistantStart does not re-emit hint when already active', async () => {
    const emitAttention = vi.fn()
    const a = createSubject({ micType: 0, disableAudioOutput: true })
    a.emitAttention = emitAttention
    a.uiVoiceAssistantHintActive = true

    a.handleAudioData({ command: 4 })

    expect(emitAttention).not.toHaveBeenCalledWith('voiceAssistant', true)
  })

  test('handleAudioData NaviStart keeps hint and audioType when already active and no audioType given', async () => {
    const emitAttention = vi.fn()
    const a = createSubject()
    a.emitAttention = emitAttention
    a.uiNavHintActive = true
    a.navAudioType = 5

    a.handleAudioData({ command: 6 })

    expect(emitAttention).not.toHaveBeenCalled()
    expect(a.navAudioType).toBe(5)
  })

  test('handleAudioData AudioMediaStart is a no-op when unarmed and media already active', async () => {
    const a = createSubject()
    a.audioOpenArmed = false
    a.mediaActive = true
    a.musicWarmupUntil = 0

    a.handleAudioData({ command: 11 })

    expect(a.mediaActive).toBe(true)
    expect(a.musicWarmupUntil).toBe(0)
  })

  test('handleAudioData AudioMediaStop skips music player teardown when no key is remembered', async () => {
    const a = createSubject()
    a.mediaActive = true
    a.lastMusicPlayerKey = null
    a.stopPlayerByKey = vi.fn()

    a.handleAudioData({ command: 12 })

    expect(a.stopPlayerByKey).not.toHaveBeenCalled()
    expect(a.mediaActive).toBe(false)
  })

  test('handleAudioData AudioOutputStop with a specific audioType only stops the matching stream', async () => {
    const a = createSubject()
    a.musicAudioType = 1
    a.navAudioType = 2
    a.lastMusicPlayerKey = 'm'
    a.lastNavPlayerKey = 'n'
    a.lastVoiceAssistantPlayerKey = 'va'
    a.lastCallPlayerKey = 'call'
    a.stopPlayerByKey = vi.fn()

    a.handleAudioData({ command: 13, audioType: 1 })

    expect(a.stopPlayerByKey).toHaveBeenCalledWith('m')
    expect(a.stopPlayerByKey).not.toHaveBeenCalledWith('n')
    expect(a.stopPlayerByKey).not.toHaveBeenCalledWith('va')
    expect(a.lastMusicPlayerKey).toBeNull()
    expect(a.lastNavPlayerKey).toBe('n')
  })

  test('handleAudioData AudioOutputStop with an unmatched audioType stops nothing', async () => {
    const a = createSubject()
    a.musicAudioType = 1
    a.navAudioType = 2
    a.lastMusicPlayerKey = 'm'
    a.lastNavPlayerKey = 'n'
    a.stopPlayerByKey = vi.fn()

    a.handleAudioData({ command: 13, audioType: 99 })

    expect(a.stopPlayerByKey).not.toHaveBeenCalled()
    expect(a.lastMusicPlayerKey).toBe('m')
    expect(a.lastNavPlayerKey).toBe('n')
  })

  test('handleAudioData AudioOutputStop leaves voiceAssistant/call keys when none are remembered', async () => {
    const a = createSubject()
    a.lastMusicPlayerKey = null
    a.lastNavPlayerKey = null
    a.lastVoiceAssistantPlayerKey = null
    a.lastCallPlayerKey = null
    a.stopPlayerByKey = vi.fn()

    a.handleAudioData({ command: 13 })

    expect(a.stopPlayerByKey).not.toHaveBeenCalled()
  })

  test('handleAudioData AudioInputConfig without a decodeType is a no-op', async () => {
    const a = createSubject()
    a.currentMicDecodeType = 7

    a.handleAudioData({ command: 14 })

    expect(a.currentMicDecodeType).toBe(7)
  })

  test('handleAudioData VoiceAssistantStop clears state even without a remembered player', async () => {
    const a = createSubject()
    a.voiceAssistantActive = true
    a.lastVoiceAssistantPlayerKey = null
    a.stopPlayerByKey = vi.fn()
    a._mic = { stop: vi.fn() }

    a.handleAudioData({ command: 5 })

    expect(a.voiceAssistantActive).toBe(false)
    expect(a.stopPlayerByKey).not.toHaveBeenCalled()
    expect(a._mic.stop).toHaveBeenCalled()
  })

  test('handleAudioData settles a ramp whose current already equals its target', async () => {
    const a = createSubject()
    const player = { write: vi.fn() }
    a.getAudioOutputForStream = vi.fn(() => player)
    a.getLogicalStreamKey = vi.fn(() => 'music')
    a.mediaActive = true
    a.volumes.music = 1
    a.duckLevel = 0.5
    a.musicFade = { current: 0.5, target: 0.5, remainingSamples: 10 }
    a.musicRampActive = true
    a.musicGateMuted = false
    a.nextMusicRampStartAt = 0
    a.musicWarmupUntil = 0

    a.handleAudioData({ data: new Int16Array([100, -100]), sampleRate: 48000, channels: 2 })

    expect(a.musicRampActive).toBe(false)
    expect(a.musicFade.current).toBe(0.5)
  })
})
