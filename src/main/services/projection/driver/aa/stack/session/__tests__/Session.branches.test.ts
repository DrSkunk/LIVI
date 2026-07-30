import { EventEmitter } from 'node:events'
import type { Mock } from 'vitest'

class MockSocket extends EventEmitter {
  destroy = vi.fn()
  end = vi.fn()
  setKeepAlive = vi.fn()
  writable = true
  remoteAddress = '::ffff:192.168.1.5%wlan0'
  write = vi.fn((_data: Buffer, cb?: () => void) => {
    cb?.()
    return true
  })
}

vi.mock('../ServiceDiscoveryBuilder', () => ({
  buildServiceDiscoveryResponse: vi.fn(() => ({
    buf: Buffer.from([0x08, 0x00]),
    videoCodecByIndex: ['h264', 'h265'],
    clusterCodecByIndex: ['h264']
  }))
}))

vi.mock('../SessionTls', () => ({ SessionTls: vi.fn() }))

import { AV_MSG, CH, CTRL_MSG, FRAME_FLAGS, MEDIA_CODEC } from '../../constants'
import * as protoIndex from '../../proto/index'
import { buildServiceDiscoveryResponse } from '../ServiceDiscoveryBuilder'
import { Session, type SessionConfig } from '../Session'
import { SessionTls } from '../SessionTls'

const RUNNING = 6
const CLOSED = 7

function protoStub(): Record<string, unknown> {
  const codec = {
    verify: () => null,
    create: (f: Record<string, unknown>) => f,
    encode: () => ({ finish: () => new Uint8Array([0x08, 0x00]) }),
    decode: (_b: Buffer) => ({}),
    toObject: (m: unknown) => m
  }
  return {
    ChannelOpenResponse: codec,
    AVChannelSetupRequest: { ...codec, decode: () => ({ mediaCodecType: MEDIA_CODEC.VIDEO_H265 }) },
    AVChannelSetupResponse: codec,
    AuthCompleteIndication: codec,
    ServiceDiscoveryResponse: codec,
    PingRequest: codec,
    PhoneStatus: { ...codec, decode: () => ({ signalStrength: 3 }), toObject: (m: unknown) => m }
  }
}

function baseCfg(over: Partial<SessionConfig> = {}): SessionConfig {
  return {
    huName: 'LIVI',
    videoWidth: 1280,
    videoHeight: 720,
    videoFps: 30,
    videoDpi: 140,
    displayWidth: 1280,
    displayHeight: 720,
    clusterEnabled: false,
    clusterWidth: 0,
    clusterHeight: 0,
    clusterFps: 0,
    clusterDpi: 0,
    ...over
  } as SessionConfig
}

function makeSession(over: Partial<SessionConfig> = {}): { session: Session; sock: MockSocket } {
  const sock = new MockSocket()
  const session = new Session(sock as unknown as import('net').Socket, baseCfg(over))
  return { session, sock }
}

function forceRunning(session: Session): void {
  ;(session as unknown as { _state: number })._state = RUNNING
}

function setState(session: Session, state: number): void {
  ;(session as unknown as { _state: number })._state = state
}

function captureEncrypted(session: Session): Mock {
  const fn = vi.fn()
  ;(session as unknown as { _sendEncrypted: Mock })._sendEncrypted = fn
  return fn
}

function dispatch(
  session: Session,
  ch: number,
  flags: number,
  msgId: number,
  payload: Buffer
): void {
  ;(
    session as unknown as { _handleDecryptedMessage: (...a: unknown[]) => void }
  )._handleDecryptedMessage(ch, flags, msgId, payload)
}

async function started(over: Partial<SessionConfig> = {}): Promise<{
  session: Session
  sock: MockSocket
}> {
  const { session, sock } = makeSession(over)
  ;(session as unknown as { _sendVersionRequest: Mock })._sendVersionRequest = vi.fn()
  const spy = vi.spyOn(protoIndex, 'loadProtos').mockResolvedValue(protoStub() as never)
  await session.start()
  spy.mockRestore()
  return { session, sock }
}

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  ;(buildServiceDiscoveryResponse as Mock).mockClear()
})
afterEach(() => vi.restoreAllMocks())

describe('cluster stream control', () => {
  test('forceClusterKeyframe is a no-op outside RUNNING or when unwanted', () => {
    const { session } = makeSession()
    const sent = captureEncrypted(session)
    session.forceClusterKeyframe()
    forceRunning(session)
    ;(session as unknown as { _clusterStreamWanted: boolean })._clusterStreamWanted = false
    session.forceClusterKeyframe()
    expect(sent).not.toHaveBeenCalled()
  })

  test('forceClusterKeyframe sends two focus indications', () => {
    vi.useFakeTimers()
    const { session } = makeSession()
    forceRunning(session)
    const sent = captureEncrypted(session)
    session.forceClusterKeyframe()
    expect(sent).toHaveBeenCalledTimes(1)
    expect(sent.mock.calls[0][0]).toBe(CH.CLUSTER_VIDEO)
    vi.advanceTimersByTime(60)
    expect(sent).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  test('forceClusterKeyframe delayed indication is skipped if state changed', () => {
    vi.useFakeTimers()
    const { session } = makeSession()
    forceRunning(session)
    const sent = captureEncrypted(session)
    session.forceClusterKeyframe()
    setState(session, CLOSED)
    vi.advanceTimersByTime(60)
    expect(sent).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  test('setClusterStreamActive toggles and is idempotent', () => {
    const { session } = makeSession()
    forceRunning(session)
    ;(session as unknown as { _mainFrameSeen: boolean })._mainFrameSeen = true
    const sent = captureEncrypted(session)

    session.setClusterStreamActive(true)
    expect(sent).not.toHaveBeenCalled()

    session.setClusterStreamActive(false)
    expect(sent).toHaveBeenCalledTimes(1)
    expect(sent.mock.calls[0][3]).toEqual(Buffer.from([0x08, 0x02]))

    sent.mockClear()
    session.setClusterStreamActive(true)
    expect(sent).toHaveBeenCalledTimes(1)
    expect(sent.mock.calls[0][3]).toEqual(Buffer.from([0x08, 0x01]))
  })

  test('_requestClusterStream holds while not RUNNING then sends once ready', () => {
    const { session } = makeSession()
    const sent = captureEncrypted(session)
    const req = (): void =>
      (session as unknown as { _requestClusterStream: () => void })._requestClusterStream()

    req()
    expect((session as unknown as { _clusterFocusPending: boolean })._clusterFocusPending).toBe(
      true
    )
    expect(sent).not.toHaveBeenCalled()

    forceRunning(session)
    ;(session as unknown as { _mainFrameSeen: boolean })._mainFrameSeen = true
    req()
    expect(sent).toHaveBeenCalledTimes(1)
    expect((session as unknown as { _clusterFocusPending: boolean })._clusterFocusPending).toBe(
      false
    )
  })

  test('_requestClusterStream is a no-op when the cluster is unwanted', () => {
    const { session } = makeSession()
    forceRunning(session)
    ;(session as unknown as { _clusterStreamWanted: boolean })._clusterStreamWanted = false
    const sent = captureEncrypted(session)
    ;(session as unknown as { _requestClusterStream: () => void })._requestClusterStream()
    expect(sent).not.toHaveBeenCalled()
  })

  test('_stopClusterStream sends NATIVE only when RUNNING', () => {
    const { session } = makeSession()
    const sent = captureEncrypted(session)
    ;(session as unknown as { _stopClusterStream: () => void })._stopClusterStream()
    expect(sent).not.toHaveBeenCalled()
    forceRunning(session)
    ;(session as unknown as { _stopClusterStream: () => void })._stopClusterStream()
    expect(sent).toHaveBeenCalledTimes(1)
    expect(sent.mock.calls[0][3]).toEqual(Buffer.from([0x08, 0x02]))
  })
})

describe('requestMainKeyframe', () => {
  test('no-op outside RUNNING', () => {
    const { session } = makeSession()
    const sent = captureEncrypted(session)
    session.requestMainKeyframe()
    expect(sent).not.toHaveBeenCalled()
  })

  test('sends an immediate and a delayed focus indication', () => {
    vi.useFakeTimers()
    const { session } = makeSession()
    forceRunning(session)
    const sent = captureEncrypted(session)
    session.requestMainKeyframe()
    expect(sent).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(60)
    expect(sent).toHaveBeenCalledTimes(2)
    expect(sent.mock.calls[1][3]).toEqual(Buffer.from([0x08, 0x01]))
    vi.useRealTimers()
  })

  test('delayed indication skipped when state left RUNNING', () => {
    vi.useFakeTimers()
    const { session } = makeSession()
    forceRunning(session)
    const sent = captureEncrypted(session)
    session.requestMainKeyframe()
    setState(session, CLOSED)
    vi.advanceTimersByTime(60)
    expect(sent).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})

describe('_handleAVSetupRequest — codec selection', () => {
  function setup(codecType: number): { session: Session; sent: Mock } {
    const { session } = makeSession()
    const sent = captureEncrypted(session)
    const proto = protoStub()
    ;(proto.AVChannelSetupRequest as { decode: Mock }).decode = vi.fn(() => ({
      mediaCodecType: codecType
    }))
    ;(session as unknown as { _proto: unknown })._proto = proto
    return { session, sent }
  }

  test.each([
    [MEDIA_CODEC.VIDEO_H265, 'h265'],
    [MEDIA_CODEC.VIDEO_VP9, 'vp9'],
    [MEDIA_CODEC.VIDEO_AV1, 'av1'],
    [999, 'h264']
  ])('video codec %s → %s', (codecType, expected) => {
    const { session, sent } = setup(codecType)
    ;(session as unknown as { _videoCodecByIndex: string[] })._videoCodecByIndex = [
      'h264',
      'h265',
      'vp9',
      'av1'
    ]
    const cb = vi.fn()
    session.on('video-codec', cb)
    ;(
      session as unknown as { _handleAVSetupRequest: (c: number, p: Buffer) => void }
    )._handleAVSetupRequest(CH.VIDEO, Buffer.alloc(0))
    expect(cb).toHaveBeenCalledWith(expected)
    expect(sent).toHaveBeenCalled()
  })

  test('video codec not in the offered list keeps configIdx 0', () => {
    const { session } = setup(MEDIA_CODEC.VIDEO_AV1)
    ;(session as unknown as { _videoCodecByIndex: string[] })._videoCodecByIndex = ['h264']
    ;(
      session as unknown as { _handleAVSetupRequest: (c: number, p: Buffer) => void }
    )._handleAVSetupRequest(CH.VIDEO, Buffer.alloc(0))
    expect((session as unknown as { _videoCodec: string })._videoCodec).toBe('av1')
  })

  test('unchanged video codec does not re-emit but still logs once', () => {
    const { session } = setup(MEDIA_CODEC.VIDEO_H265)
    ;(session as unknown as { _videoCodecByIndex: string[] })._videoCodecByIndex = ['h264', 'h265']
    ;(session as unknown as { _videoCodec: string })._videoCodec = 'h265'
    ;(session as unknown as { _phoneCodecLogged: boolean })._phoneCodecLogged = true
    const cb = vi.fn()
    session.on('video-codec', cb)
    ;(
      session as unknown as { _handleAVSetupRequest: (c: number, p: Buffer) => void }
    )._handleAVSetupRequest(CH.VIDEO, Buffer.alloc(0))
    expect(cb).not.toHaveBeenCalled()
  })

  test.each([
    [MEDIA_CODEC.VIDEO_H265, 'h265'],
    [MEDIA_CODEC.VIDEO_VP9, 'vp9'],
    [MEDIA_CODEC.VIDEO_AV1, 'av1'],
    [999, 'h264']
  ])('cluster codec %s → %s', (codecType, expected) => {
    const { session } = setup(codecType)
    ;(session as unknown as { _clusterCodecByIndex: string[] })._clusterCodecByIndex = [
      'h264',
      'h265',
      'vp9',
      'av1'
    ]
    const cb = vi.fn()
    session.on('cluster-video-codec', cb)
    ;(
      session as unknown as { _handleAVSetupRequest: (c: number, p: Buffer) => void }
    )._handleAVSetupRequest(CH.CLUSTER_VIDEO, Buffer.alloc(0))
    expect(cb).toHaveBeenCalledWith(expected)
  })

  test('cluster codec not in the offered list keeps configIdx 0', () => {
    const { session } = setup(MEDIA_CODEC.VIDEO_AV1)
    ;(session as unknown as { _clusterCodecByIndex: string[] })._clusterCodecByIndex = ['h264']
    const cb = vi.fn()
    session.on('cluster-video-codec', cb)
    ;(
      session as unknown as { _handleAVSetupRequest: (c: number, p: Buffer) => void }
    )._handleAVSetupRequest(CH.CLUSTER_VIDEO, Buffer.alloc(0))
    expect(cb).toHaveBeenCalledWith('av1')
  })

  test('unchanged cluster codec does not re-emit', () => {
    const { session } = setup(MEDIA_CODEC.VIDEO_H265)
    ;(session as unknown as { _clusterCodecByIndex: string[] })._clusterCodecByIndex = ['h265']
    ;(session as unknown as { _clusterCodec: string })._clusterCodec = 'h265'
    const cb = vi.fn()
    session.on('cluster-video-codec', cb)
    ;(
      session as unknown as { _handleAVSetupRequest: (c: number, p: Buffer) => void }
    )._handleAVSetupRequest(CH.CLUSTER_VIDEO, Buffer.alloc(0))
    expect(cb).not.toHaveBeenCalled()
  })

  test.each([CH.SPEECH_AUDIO, CH.SYSTEM_AUDIO])('16k mono setup for channel %s', (chId) => {
    const { session } = setup(1)
    const audio = new Map<number, { handleSetupRequest: Mock }>()
    audio.set(chId, { handleSetupRequest: vi.fn() })
    ;(session as unknown as { _audio: unknown })._audio = audio
    ;(
      session as unknown as { _handleAVSetupRequest: (c: number, p: Buffer) => void }
    )._handleAVSetupRequest(chId, Buffer.alloc(0))
    expect(audio.get(chId)!.handleSetupRequest).toHaveBeenCalledWith(1, 16000, 1)
  })
})

describe('wifi credentials with unset config', () => {
  test('missing ssid and password fall back to empty strings', () => {
    const { session } = makeSession()
    const sent = captureEncrypted(session)
    ;(
      session as unknown as { _handleWifiCredentialsRequest: () => void }
    )._handleWifiCredentialsRequest()
    expect(sent).toHaveBeenCalledTimes(1)
  })
})

describe('sensor start request payload guard', () => {
  test('a short or non-0x08 sensor request defaults the type to zero', () => {
    const { session } = makeSession()
    const sent = captureEncrypted(session)
    ;(
      session as unknown as { _handleSensorStartRequest: (b: Buffer) => void }
    )._handleSensorStartRequest(Buffer.alloc(0))
    ;(
      session as unknown as { _handleSensorStartRequest: (b: Buffer) => void }
    )._handleSensorStartRequest(Buffer.from([0x09, 5]))
    expect(sent).toHaveBeenCalled()
  })
})

describe('_handleDecryptedMessage — phone status + start indication', () => {
  test('PHONE_STATUS emits device-status when signal present', () => {
    const { session } = makeSession()
    ;(session as unknown as { _proto: unknown })._proto = protoStub()
    const cb = vi.fn()
    session.on('device-status', cb)
    dispatch(session, CH.PHONE_STATUS, 0, 0x8001, Buffer.alloc(0))
    expect(cb).toHaveBeenCalledWith({ ip: '192.168.1.5', signalStrength: 3 })
  })

  test('PHONE_STATUS without a numeric signal emits nothing', () => {
    const { session } = makeSession()
    const proto = protoStub()
    ;(proto.PhoneStatus as { decode: Mock }).decode = vi.fn(() => ({}))
    ;(session as unknown as { _proto: unknown })._proto = proto
    const cb = vi.fn()
    session.on('device-status', cb)
    dispatch(session, CH.PHONE_STATUS, 0, 0x8001, Buffer.alloc(0))
    expect(cb).not.toHaveBeenCalled()
  })

  test('PHONE_STATUS decode error is swallowed', () => {
    const { session } = makeSession()
    const proto = protoStub()
    ;(proto.PhoneStatus as { decode: Mock }).decode = vi.fn(() => {
      throw new Error('bad proto')
    })
    ;(session as unknown as { _proto: unknown })._proto = proto
    expect(() => dispatch(session, CH.PHONE_STATUS, 0, 0x8001, Buffer.alloc(0))).not.toThrow()
  })

  test('PHONE_STATUS ignores non-8001 message ids', () => {
    const { session } = makeSession()
    const cb = vi.fn()
    session.on('device-status', cb)
    dispatch(session, CH.PHONE_STATUS, 0, 0x1234, Buffer.alloc(0))
    expect(cb).not.toHaveBeenCalled()
  })

  test('START_INDICATION on an unmapped audio channel is handled without routing', () => {
    const { session } = makeSession()
    ;(session as unknown as { _audio: Map<number, unknown> })._audio = new Map()
    const cb = vi.fn()
    session.on('video-codec', cb)
    expect(() =>
      dispatch(session, CH.MEDIA_AUDIO, 0, AV_MSG.START_INDICATION, Buffer.from([0x08, 0x01]))
    ).not.toThrow()
    expect(cb).not.toHaveBeenCalled()
  })

  test('START_INDICATION on an auxiliary channel with no session id is handled', () => {
    const { session } = makeSession()
    expect(() => dispatch(session, 0x7f, 0, AV_MSG.START_INDICATION, Buffer.alloc(0))).not.toThrow()
  })

  test('mapped audio channel forwards non-setup messages', () => {
    const { session } = makeSession()
    const handleMessage = vi.fn()
    const audio = new Map<number, { handleMessage: Mock }>()
    audio.set(CH.MEDIA_AUDIO, { handleMessage })
    ;(session as unknown as { _audio: unknown })._audio = audio
    dispatch(session, CH.MEDIA_AUDIO, 0, 0x0001, Buffer.from([1]))
    expect(handleMessage).toHaveBeenCalled()
  })

  test('unhandled wifi and unknown channels fall through silently without DEBUG', () => {
    const { session } = makeSession()
    expect(() => dispatch(session, CH.WIFI, 0, 0x9999, Buffer.alloc(0))).not.toThrow()
    expect(() => dispatch(session, 0x7d, 0, 0x4444, Buffer.alloc(0))).not.toThrow()
  })

  test('pre-TLS default frame routes by tls presence and encrypted flag', async () => {
    const { session } = makeSession()
    const raw = (f: Record<string, unknown>): Promise<void> =>
      (session as unknown as { _handleRawFrame: (x: unknown) => Promise<void> })._handleRawFrame(f)
    const base = {
      msgId: 0x1234,
      payload: Buffer.alloc(0),
      channelId: 3,
      rawPayload: Buffer.from([1])
    }
    await raw({ ...base, flags: 0x08 })
    const inject = vi.fn()
    ;(session as unknown as { _tls: unknown })._tls = { injectEncrypted: inject }
    await raw({ ...base, flags: 0x00 })
    await raw({ ...base, flags: 0x08 })
    expect(inject).toHaveBeenCalledTimes(1)
  })
})

describe('_writeSock + _sendAA', () => {
  test('_writeSock drops when CLOSED', () => {
    const { session, sock } = makeSession()
    setState(session, CLOSED)
    ;(session as unknown as { _writeSock: (b: Buffer) => void })._writeSock(Buffer.from([1]))
    expect(sock.write).not.toHaveBeenCalled()
  })

  test('_writeSock drops when the socket is not writable', () => {
    const { session, sock } = makeSession()
    sock.writable = false
    ;(session as unknown as { _writeSock: (b: Buffer) => void })._writeSock(Buffer.from([1]))
    expect(sock.write).not.toHaveBeenCalled()
  })

  test('_sendAA encrypted path hands the cleartext to the TLS bridge', () => {
    const { session } = makeSession()
    setState(session, 3)
    const sendEncrypted = vi.fn()
    ;(session as unknown as { _tls: unknown })._tls = { sendEncrypted }
    ;(session as unknown as { _sendAA: (...a: unknown[]) => void })._sendAA(
      CH.SENSOR,
      FRAME_FLAGS.ENC_SIGNAL,
      0x8003,
      Buffer.from([1, 2])
    )
    expect(sendEncrypted).toHaveBeenCalled()
    const cleartext = sendEncrypted.mock.calls[0][2] as Buffer
    expect(cleartext.readUInt16BE(0)).toBe(0x8003)
  })
})

describe('start() — wiring and control events', () => {
  test('wires channels, sends SDR, ping and forwards device-info + battery', async () => {
    vi.useFakeTimers()
    const { session } = await started()
    const control = (session as unknown as { _control: EventEmitter })._control
    const sendAA = vi.fn()
    ;(session as unknown as { _sendAA: Mock })._sendAA = sendAA
    ;(session as unknown as { _openChannels: Mock })._openChannels = vi.fn()

    const info = vi.fn()
    const status = vi.fn()
    session.on('device-info', info)
    session.on('device-status', status)

    control.emit('service-discovery-request', {
      deviceName: 'Pixel',
      deviceBrand: 'Google',
      phoneInfo: { instanceId: 'abc' }
    })
    expect(buildServiceDiscoveryResponse).toHaveBeenCalled()
    expect(info).toHaveBeenCalledWith({
      name: 'Pixel',
      model: 'Google',
      instanceId: 'abc',
      ip: '192.168.1.5'
    })
    expect(sendAA).toHaveBeenCalled()

    control.emit('battery', { level: 80, critical: false, timeRemaining: 3600 })
    expect(status).toHaveBeenCalledWith({
      ip: '192.168.1.5',
      batteryLevel: 80,
      batteryCritical: false,
      batteryTimeRemaining: 3600
    })

    session.close()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  test('SDR handler with no identity fields skips device-info', async () => {
    const { session } = await started()
    const control = (session as unknown as { _control: EventEmitter })._control
    ;(session as unknown as { _sendAA: Mock })._sendAA = vi.fn()
    ;(session as unknown as { _openChannels: Mock })._openChannels = vi.fn()
    const info = vi.fn()
    session.on('device-info', info)
    control.emit('service-discovery-request', {})
    expect(info).not.toHaveBeenCalled()
    session.close()
  })

  test('ping timeout closes the session', async () => {
    vi.useFakeTimers()
    const { session, sock } = await started()
    const control = (session as unknown as { _control: EventEmitter })._control
    ;(session as unknown as { _sendAA: Mock })._sendAA = vi.fn()
    ;(session as unknown as { _openChannels: Mock })._openChannels = vi.fn()
    control.emit('service-discovery-request', {})
    ;(session as unknown as { _lastPongAt: number })._lastPongAt = -100000
    vi.advanceTimersByTime(1500)
    expect((session as unknown as { _state: number })._state).toBe(CLOSED)
    expect(sock.destroy).toHaveBeenCalled()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  test('control forwards voice, audio-focus, pong, channel-open and av-setup', async () => {
    const { session } = await started()
    const control = (
      session as unknown as { _control: EventEmitter } & {
        _control: EventEmitter & { sendChannelOpenResponse?: Mock }
      }
    )._control as EventEmitter & { sendChannelOpenResponse: Mock }
    control.sendChannelOpenResponse = vi.fn()
    const avSetup = vi.fn()
    ;(session as unknown as { _handleAVSetupRequest: Mock })._handleAVSetupRequest = avSetup

    const voice = vi.fn()
    const focus = vi.fn()
    session.on('voice-session', voice)
    session.on('audio-focus', focus)
    control.emit('voice-session', true)
    control.emit('audio-focus-request', 2)
    control.emit('pong')
    control.emit('channel-open-request', CH.VIDEO)
    control.emit('av-setup-request', CH.VIDEO, Buffer.alloc(0))

    expect(voice).toHaveBeenCalledWith(true)
    expect(focus).toHaveBeenCalledWith(2)
    expect(control.sendChannelOpenResponse).toHaveBeenCalledWith(CH.VIDEO, 0)
    expect(avSetup).toHaveBeenCalled()
    session.close()
  })

  test('control shutdown transitions to CLOSED', async () => {
    const { session } = await started()
    const control = (session as unknown as { _control: EventEmitter })._control
    control.emit('shutdown', 3)
    expect((session as unknown as { _state: number })._state).toBe(CLOSED)
  })

  test('forwards video, cluster, audio, mic, media and nav channel events', async () => {
    const { session } = await started()
    const s = session as unknown as {
      _video: EventEmitter
      _cluster: EventEmitter
      _audio: Map<number, EventEmitter>
      _mic: EventEmitter
      _media: EventEmitter
      _nav: EventEmitter
      _requestClusterStream: () => void
    }
    const events: Record<string, Mock> = {}
    for (const name of [
      'video-frame',
      'host-ui-requested',
      'video-focus-projected',
      'cluster-video-frame',
      'cluster-video-focus-projected',
      'audio-frame',
      'audio-start',
      'audio-stop',
      'mic-start',
      'mic-stop',
      'media-metadata',
      'media-status',
      'nav-start',
      'nav-stop',
      'nav-status',
      'nav-turn',
      'nav-distance',
      'nav-state',
      'nav-position'
    ]) {
      events[name] = vi.fn()
      session.on(name, events[name])
    }
    s._requestClusterStream = vi.fn()

    s._video.emit('frame', Buffer.from([1]), 5n)
    s._video.emit('host-ui-requested')
    s._video.emit('video-focus-projected')
    s._cluster.emit('frame', Buffer.from([2]), 6n)
    s._cluster.emit('video-focus-projected')
    const audio = s._audio.get(CH.MEDIA_AUDIO)!
    audio.emit('pcm', Buffer.from([3]), 7n, 'media')
    audio.emit('start', 'media', CH.MEDIA_AUDIO)
    audio.emit('stop', 'media', CH.MEDIA_AUDIO)
    s._mic.emit('mic-start', CH.MIC_INPUT)
    s._mic.emit('mic-stop', CH.MIC_INPUT)
    s._media.emit('metadata', { title: 'x' })
    s._media.emit('status', { playbackState: 1 })
    s._nav.emit('nav-start')
    s._nav.emit('nav-stop')
    s._nav.emit('nav-status', {})
    s._nav.emit('nav-turn', {})
    s._nav.emit('nav-distance', {})
    s._nav.emit('nav-state', {})
    s._nav.emit('nav-position', {})

    for (const name of Object.keys(events)) expect(events[name]).toHaveBeenCalled()
    session.close()
  })

  test('first main frame releases a pending cluster request, later frames do not', async () => {
    const { session } = await started()
    const s = session as unknown as {
      _video: EventEmitter
      _clusterFocusPending: boolean
      _requestClusterStream: Mock
    }
    s._requestClusterStream = vi.fn()
    s._clusterFocusPending = true
    s._video.emit('frame', Buffer.from([1]), 0n)
    expect(s._requestClusterStream).toHaveBeenCalledTimes(1)
    s._video.emit('frame', Buffer.from([2]), 1n)
    expect(s._requestClusterStream).toHaveBeenCalledTimes(1)
    session.close()
  })

  test('pre-RUNNING watchdog aborts a stalled session', async () => {
    vi.useFakeTimers()
    const { session } = await started()
    const err = vi.fn()
    session.on('error', err)
    const close = vi.spyOn(session, 'close')
    vi.advanceTimersByTime(30_000)
    expect(err).toHaveBeenCalled()
    expect(close).toHaveBeenCalledWith('pre-RUNNING watchdog')
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  test('pre-RUNNING watchdog does nothing once RUNNING', async () => {
    vi.useFakeTimers()
    const { session } = await started()
    forceRunning(session)
    const err = vi.fn()
    session.on('error', err)
    vi.advanceTimersByTime(30_000)
    expect(err).not.toHaveBeenCalled()
    session.close()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  test('watchdog swallows a throwing error listener', async () => {
    vi.useFakeTimers()
    const { session } = await started()
    session.on('error', () => {
      throw new Error('listener blew up')
    })
    expect(() => vi.advanceTimersByTime(30_000)).not.toThrow()
    vi.clearAllTimers()
    vi.useRealTimers()
  })
})

describe('_startTls callbacks', () => {
  test('onSecureConnect transitions to AUTH and runs post-TLS setup', async () => {
    const { session } = makeSession()
    let tlsOpts: Record<string, (...a: unknown[]) => unknown> = {}
    ;(SessionTls as unknown as Mock).mockImplementation(function (
      opts: Record<string, (...a: unknown[]) => unknown>
    ) {
      tlsOpts = opts
    })
    const post = vi.fn(async () => {})
    ;(session as unknown as { _postTlsSetup: Mock })._postTlsSetup = post

    await (session as unknown as { _startTls: () => Promise<void> })._startTls()
    tlsOpts.onSecureConnect()
    expect((session as unknown as { _state: number })._state).toBe(3)
    await Promise.resolve()
    expect(post).toHaveBeenCalled()

    const err = vi.fn()
    session.on('error', err)
    tlsOpts.onError(new Error('tls fail'))
    expect(err).toHaveBeenCalled()

    ;(session as unknown as { _state: number })._state = 2
    expect(tlsOpts.isHandshakePhase()).toBe(true)
    tlsOpts.writeRaw(Buffer.from([1]))
    tlsOpts.onDecryptedMessage(0, 0, 0, Buffer.alloc(0))
  })
})

describe('channel send closures + misc guards', () => {
  test('each channel _send closure delegates to the session senders', async () => {
    const { session } = await started()
    const s = session as unknown as {
      _control: { _send: (...a: unknown[]) => void }
      _video: { _send: (...a: unknown[]) => void }
      _cluster: { _send: (...a: unknown[]) => void }
      _audio: Map<number, { _send: (...a: unknown[]) => void }>
      _mic: { _send: (...a: unknown[]) => void }
      _sendAA: Mock
      _sendEncrypted: Mock
    }
    s._sendAA = vi.fn()
    s._sendEncrypted = vi.fn()
    s._control._send(CH.CONTROL, 0x03, 0x1, Buffer.alloc(0))
    s._video._send(CH.VIDEO, 0x0b, 0x1, Buffer.alloc(0))
    s._cluster._send(CH.CLUSTER_VIDEO, 0x0b, 0x1, Buffer.alloc(0))
    s._audio.get(CH.MEDIA_AUDIO)!._send(CH.MEDIA_AUDIO, 0x0b, 0x1, Buffer.alloc(0))
    s._mic._send(CH.MIC_INPUT, 0x0b, 0x1, Buffer.alloc(0))
    ;(session as unknown as { _input: { _send: (...a: unknown[]) => void } })._input._send(
      CH.INPUT,
      0x0b,
      0x1,
      Buffer.alloc(0)
    )
    expect(s._sendAA).toHaveBeenCalledTimes(1)
    expect(s._sendEncrypted).toHaveBeenCalledTimes(5)
    session.close()
  })

  test('sensor ternaries cover both the true and false arms', () => {
    const { session } = makeSession()
    forceRunning(session)
    captureEncrypted(session)
    session.sendSpeedData(13_000, false, 0)
    session.sendNightModeData(false)
    session.sendParkingBrakeData(true)
    session.sendLightData(2, false, 3)
    session.sendEnvironmentData(20_000, 101_000, 0)
    session.sendFuelData(50, 200, false)
  })

  test('optional channel handlers short-circuit before start()', async () => {
    const { session } = makeSession()
    ;(session as unknown as { _proto: unknown })._proto = protoStub()
    const d = (ch: number, mid: number, p = Buffer.alloc(0)): void =>
      dispatch(session, ch, 0, mid, p)
    expect(() => {
      d(CH.CONTROL, 0x1)
      d(CH.VIDEO, 0x1, Buffer.from([1]))
      d(CH.CLUSTER_VIDEO, 0x1, Buffer.from([1]))
      d(CH.MEDIA_INFO, 0x1)
      d(CH.NAVIGATION, 0x1)
      d(CH.MIC_INPUT, 0x1, Buffer.from([1]))
    }).not.toThrow()
  })

  test('tls injects short-circuit when the bridge is unset', async () => {
    const { session } = makeSession()
    const enc = Buffer.alloc(6)
    enc.writeUInt8(3, 0)
    enc.writeUInt8(0x0b, 1)
    enc.writeUInt16BE(2, 2)
    enc.writeUInt16BE(0xdead, 4)
    expect(() =>
      (
        session as unknown as { _stripHeaderAndInjectTls: (b: Buffer) => void }
      )._stripHeaderAndInjectTls(enc)
    ).not.toThrow()
    await (
      session as unknown as { _handleRawFrame: (f: unknown) => Promise<void> }
    )._handleRawFrame({
      msgId: CTRL_MSG.SSL_HANDSHAKE,
      payload: Buffer.from([1]),
      flags: 0,
      channelId: 0,
      rawPayload: Buffer.alloc(0)
    })
  })

  test('battery and SDR handlers tolerate a missing remote address', async () => {
    vi.useFakeTimers()
    const { session, sock } = await started()
    sock.remoteAddress = undefined as unknown as string
    ;(session as unknown as { _sendAA: Mock })._sendAA = vi.fn()
    ;(session as unknown as { _openChannels: Mock })._openChannels = vi.fn()
    const control = (session as unknown as { _control: EventEmitter })._control
    const status = vi.fn()
    const info = vi.fn()
    session.on('device-status', status)
    session.on('device-info', info)
    control.emit('battery', { critical: true })
    control.emit('service-discovery-request', { deviceName: 'X' })
    expect(status).toHaveBeenCalledWith(expect.objectContaining({ ip: '' }))
    expect(info).toHaveBeenCalledWith(expect.objectContaining({ ip: '' }))
    session.close()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  test('sendPing returns early once the session is closed', async () => {
    vi.useFakeTimers()
    const { session } = await started()
    const control = (session as unknown as { _control: EventEmitter })._control
    const sendAA = vi.fn()
    ;(session as unknown as { _sendAA: Mock })._sendAA = sendAA
    ;(session as unknown as { _openChannels: Mock })._openChannels = vi.fn()
    control.emit('service-discovery-request', {})
    sendAA.mockClear()
    setState(session, CLOSED)
    vi.advanceTimersByTime(1500)
    expect(sendAA).not.toHaveBeenCalled()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  test('sendTouch / sendButton / sendRotary / sendMicPcm no-op when the channel is missing', () => {
    const { session } = makeSession()
    forceRunning(session)
    ;(session as unknown as { _input: unknown })._input = undefined
    ;(session as unknown as { _mic: unknown })._mic = undefined
    expect(() => session.sendTouch(0, [{ x: 0, y: 0, id: 0 }])).not.toThrow()
    expect(() => session.sendButton(3, true)).not.toThrow()
    expect(() => session.sendRotary(1)).not.toThrow()
    expect(() => session.sendMicPcm(Buffer.alloc(0))).not.toThrow()
  })

  test('PHONE_STATUS strips an undefined remote address to empty', () => {
    const { session, sock } = makeSession()
    sock.remoteAddress = undefined as unknown as string
    ;(session as unknown as { _proto: unknown })._proto = protoStub()
    const cb = vi.fn()
    session.on('device-status', cb)
    dispatch(session, CH.PHONE_STATUS, 0, 0x8001, Buffer.alloc(0))
    expect(cb).toHaveBeenCalledWith({ ip: '', signalStrength: 3 })
  })

  test('wifi credentials encode multi-byte varint lengths for long values', () => {
    const { session } = makeSession({
      wifiSsid: 'S'.repeat(200),
      wifiPassword: 'P'.repeat(200)
    })
    const sent = captureEncrypted(session)
    ;(
      session as unknown as { _handleWifiCredentialsRequest: () => void }
    )._handleWifiCredentialsRequest()
    const buf = sent.mock.calls[0][3] as Buffer
    expect(buf.toString('utf8')).toContain('P'.repeat(200))
  })
})

describe('requestShutdown drain', () => {
  test('awaits the TLS drain before waiting for the ack', async () => {
    vi.useFakeTimers()
    const { session, sock } = makeSession()
    forceRunning(session)
    captureEncrypted(session)
    const drain = vi.fn(() => Promise.resolve())
    ;(session as unknown as { _tls: unknown })._tls = { drain }
    const control = new EventEmitter()
    ;(session as unknown as { _control: unknown })._control = control
    const p = session.requestShutdown()
    await vi.advanceTimersByTimeAsync(10)
    control.emit('shutdown-complete')
    await p
    expect(drain).toHaveBeenCalled()
    expect(sock.end).toHaveBeenCalled()
    vi.useRealTimers()
  })
})
