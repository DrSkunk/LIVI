import { EventEmitter } from 'node:events'
import type { Mock } from 'vitest'

class MockSocket extends EventEmitter {
  destroy = vi.fn()
  end = vi.fn()
  setKeepAlive = vi.fn()
  writable = true
  remoteAddress = '::ffff:10.0.0.9'
  write = vi.fn((_d: Buffer, cb?: () => void) => {
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

const ORIG_DEBUG = process.env.DEBUG
const ORIG_TRACE = process.env.TRACE

type SessionModule = typeof import('../Session')
type ConstModule = typeof import('../../constants')
type ProtoModule = typeof import('../../proto/index')

let Session: SessionModule['Session']
let C: ConstModule
let proto: ProtoModule

beforeAll(async () => {
  process.env.DEBUG = '1'
  process.env.TRACE = '1'
  vi.resetModules()
  ;({ Session } = await import('../Session'))
  C = await import('../../constants')
  proto = await import('../../proto/index')
})

afterAll(() => {
  if (ORIG_DEBUG === undefined) delete process.env.DEBUG
  else process.env.DEBUG = ORIG_DEBUG
  if (ORIG_TRACE === undefined) delete process.env.TRACE
  else process.env.TRACE = ORIG_TRACE
  vi.resetModules()
})

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

function protoStub(): Record<string, unknown> {
  const codec = {
    verify: () => null,
    create: (f: Record<string, unknown>) => f,
    encode: () => ({ finish: () => new Uint8Array([0x08, 0x00]) }),
    decode: () => ({ mediaCodecType: 1, signalStrength: 3 }),
    toObject: (m: unknown) => m
  }
  return {
    ChannelOpenResponse: codec,
    AVChannelSetupRequest: codec,
    AVChannelSetupResponse: codec,
    AuthCompleteIndication: codec,
    ServiceDiscoveryResponse: codec,
    PingRequest: codec,
    PhoneStatus: codec
  }
}

function cfg(over: Record<string, unknown> = {}): import('../Session').SessionConfig {
  return {
    huName: 'LIVI',
    videoWidth: 1280,
    videoHeight: 720,
    clusterEnabled: false,
    clusterWidth: 0,
    clusterHeight: 0,
    clusterFps: 0,
    clusterDpi: 0,
    ...over
  } as import('../Session').SessionConfig
}

function make(over: Record<string, unknown> = {}): {
  session: InstanceType<SessionModule['Session']>
  sock: MockSocket
} {
  const sock = new MockSocket()
  const session = new Session(sock as unknown as import('net').Socket, cfg(over))
  return { session, sock }
}

function run(session: unknown): (ch: number, fl: number, mid: number, p: Buffer) => void {
  return (
    session as { _handleDecryptedMessage: (...a: unknown[]) => void }
  )._handleDecryptedMessage.bind(session)
}

function capture(session: unknown): Mock {
  const fn = vi.fn()
  ;(session as { _sendEncrypted: Mock })._sendEncrypted = fn
  return fn
}

describe('Session under DEBUG + TRACE', () => {
  test('socket data dump (both full and truncated preview)', () => {
    const { session, sock } = make()
    ;(session as unknown as { _rawParser: { push: Mock } })._rawParser.push = vi.fn()
    ;(session as unknown as { _stripHeaderAndInjectTls: Mock })._stripHeaderAndInjectTls = vi.fn()
    sock.emit('data', Buffer.alloc(80, 0xab))
    ;(session as unknown as { _state: number })._state = 6
    sock.emit('data', Buffer.alloc(80, 0xcd))
    sock.emit('data', Buffer.alloc(4, 0x01))
  })

  test('socket end in RUNNING and pre-RUNNING both log', () => {
    const { session, sock } = make()
    ;(session as unknown as { _state: number })._state = 6
    sock.emit('end')
    const b = make()
    b.sock.emit('end')
    expect(b.sock.end).toHaveBeenCalled()
  })

  test('socket end with an unknown numeric state', () => {
    const { session, sock } = make()
    ;(session as unknown as { _state: number })._state = 99
    sock.emit('end')
    expect(sock.end).toHaveBeenCalled()
  })

  test('stripHeaderAndInjectTls plaintext, short-plaintext, encrypted and TRACE inject', () => {
    const { session } = make()
    const handle = vi.fn()
    ;(session as unknown as { _handleDecryptedMessage: Mock })._handleDecryptedMessage = handle
    const inject = vi.fn()
    ;(session as unknown as { _tls: unknown })._tls = { injectEncrypted: inject }
    const strip = (b: Buffer): void =>
      (
        session as unknown as { _stripHeaderAndInjectTls: (x: Buffer) => void }
      )._stripHeaderAndInjectTls(b)

    const plain = Buffer.alloc(8)
    plain.writeUInt8(3, 0)
    plain.writeUInt8(0x03, 1)
    plain.writeUInt16BE(4, 2)
    plain.writeUInt16BE(0x1234, 4)
    plain.writeUInt16BE(0x5678, 6)
    strip(plain)
    expect(handle).toHaveBeenCalled()

    const short = Buffer.alloc(5)
    short.writeUInt8(3, 0)
    short.writeUInt8(0x03, 1)
    short.writeUInt16BE(1, 2)
    strip(short)

    const enc = Buffer.alloc(6)
    enc.writeUInt8(3, 0)
    enc.writeUInt8(0x0b, 1)
    enc.writeUInt16BE(2, 2)
    enc.writeUInt16BE(0xdead, 4)
    strip(enc)
    expect(inject).toHaveBeenCalled()

    strip(Buffer.from([0x03]))
  })

  test('handleRawFrame SSL, encrypted pre-TLS and unknown', async () => {
    const { session } = make()
    const inject = vi.fn()
    ;(session as unknown as { _tls: unknown })._tls = {
      injectHandshakeBytes: inject,
      injectEncrypted: inject
    }
    const raw = (f: unknown): Promise<void> =>
      (session as unknown as { _handleRawFrame: (x: unknown) => Promise<void> })._handleRawFrame(f)
    await raw({
      msgId: C.CTRL_MSG.SSL_HANDSHAKE,
      payload: Buffer.from([1]),
      flags: 0,
      channelId: 0,
      rawPayload: Buffer.alloc(0)
    })
    await raw({
      msgId: 0x1234,
      payload: Buffer.alloc(0),
      flags: 0x08,
      channelId: 3,
      rawPayload: Buffer.from([1])
    })
    await raw({
      msgId: 0x1234,
      payload: Buffer.alloc(0),
      flags: 0x00,
      channelId: 3,
      rawPayload: Buffer.alloc(0)
    })
    expect(inject).toHaveBeenCalled()
  })

  test('decrypted dispatch logs across channels', () => {
    const { session } = make()
    ;(session as unknown as { _proto: unknown })._proto = protoStub()
    capture(session)
    const d = run(session)
    d(C.CH.VIDEO, 0, 0x0001, Buffer.from([1, 2]))
    d(C.CH.CONTROL, 0, C.CTRL_MSG.PING_REQUEST, Buffer.alloc(0))
    d(C.CH.SENSOR, 0, 0x9999, Buffer.alloc(0))
    d(C.CH.WIFI, 0, 0x9999, Buffer.alloc(0))
    d(C.CH.INPUT, 0, 0x8002, Buffer.alloc(0))
    d(0x7e, 0, 0x9999, Buffer.alloc(0))
    d(C.CH.MEDIA_AUDIO, 0, C.AV_MSG.START_INDICATION, Buffer.from([0x08, 0x01]))
    d(C.CH.PHONE_STATUS, 0, 0x8001, Buffer.alloc(0))
  })

  test('CHANNEL_OPEN_REQUEST logs and responds', () => {
    const { session } = make()
    ;(session as unknown as { _proto: unknown })._proto = protoStub()
    const sent = capture(session)
    run(session)(C.CH.VIDEO, 0, C.CTRL_MSG.CHANNEL_OPEN_REQUEST, Buffer.alloc(0))
    expect(sent).toHaveBeenCalled()
  })

  test('AVSetupRequest logs for video, cluster, audio and mic', () => {
    const mkSetup = (chId: number, over: Record<string, unknown> = {}): void => {
      const { session } = make(over)
      const p = protoStub()
      ;(p.AVChannelSetupRequest as { decode: Mock }).decode = vi.fn(() => ({ mediaCodecType: 1 }))
      ;(session as unknown as { _proto: unknown })._proto = p
      ;(session as unknown as { _videoCodecByIndex: string[] })._videoCodecByIndex = ['h264']
      ;(session as unknown as { _clusterCodecByIndex: string[] })._clusterCodecByIndex = ['h264']
      capture(session)
      ;(
        session as unknown as { _handleAVSetupRequest: (c: number, x: Buffer) => void }
      )._handleAVSetupRequest(chId, Buffer.alloc(0))
    }
    mkSetup(C.CH.VIDEO)
    mkSetup(C.CH.CLUSTER_VIDEO)
    const withMic = make()
    ;(withMic.session as unknown as { _mic: unknown })._mic = { handleSetupRequest: vi.fn() }
    const p = protoStub()
    ;(p.AVChannelSetupRequest as { decode: Mock }).decode = vi.fn(() => ({ mediaCodecType: 1 }))
    ;(withMic.session as unknown as { _proto: unknown })._proto = p
    capture(withMic.session)
    ;(
      withMic.session as unknown as { _handleAVSetupRequest: (c: number, x: Buffer) => void }
    )._handleAVSetupRequest(C.CH.MIC_INPUT, Buffer.alloc(0))
  })

  test('sensor start request logs for driving-status and night-mode (both defaults)', () => {
    for (const [type, night] of [
      [13, true],
      [10, true],
      [10, false],
      [99, false]
    ] as const) {
      const { session } = make({ initialNightMode: night })
      capture(session)
      ;(
        session as unknown as { _handleSensorStartRequest: (b: Buffer) => void }
      )._handleSensorStartRequest(Buffer.from([0x08, type]))
    }
  })

  test('MSG log renders an out-of-range numeric state', () => {
    const { session } = make()
    ;(session as unknown as { _state: number })._state = 99
    ;(session as unknown as { _nav: unknown })._nav = { handleMessage: vi.fn() }
    run(session)(C.CH.NAVIGATION, 0, 0x8001, Buffer.alloc(0))
  })

  test('video-ready log falls back to h264 when no codec is set', () => {
    const { session } = make()
    const p = protoStub()
    ;(p.AVChannelSetupRequest as { decode: Mock }).decode = vi.fn(() => ({ mediaCodecType: 1 }))
    ;(session as unknown as { _proto: unknown })._proto = p
    ;(session as unknown as { _videoCodecByIndex: string[] })._videoCodecByIndex = ['h264']
    ;(session as unknown as { _videoCodec: unknown })._videoCodec = null
    ;(session as unknown as { _phoneCodecLogged: boolean })._phoneCodecLogged = true
    capture(session)
    ;(
      session as unknown as { _handleAVSetupRequest: (c: number, x: Buffer) => void }
    )._handleAVSetupRequest(C.CH.VIDEO, Buffer.alloc(0))
  })

  test('wifi credentials response logs, including the missing-ssid warning', () => {
    const ok = make({ wifiSsid: 'AP', wifiPassword: 'pw' })
    capture(ok.session)
    ;(
      ok.session as unknown as { _handleWifiCredentialsRequest: () => void }
    )._handleWifiCredentialsRequest()
    const noSsid = make({ wifiSsid: '', wifiPassword: 'pw' })
    capture(noSsid.session)
    ;(
      noSsid.session as unknown as { _handleWifiCredentialsRequest: () => void }
    )._handleWifiCredentialsRequest()
  })

  test('plaintext sendAA logs non-pingpong frames', () => {
    const { session } = make()
    ;(session as unknown as { _sendAA: (...a: unknown[]) => void })._sendAA(
      0,
      0x03,
      0xabcd,
      Buffer.from([1, 2])
    )
    ;(session as unknown as { _sendAA: (...a: unknown[]) => void })._sendAA(
      C.CH.CONTROL,
      0x03,
      C.CTRL_MSG.PING_REQUEST,
      Buffer.alloc(0)
    )
    ;(session as unknown as { _sendAA: (...a: unknown[]) => void })._sendAA(
      3,
      0x0b,
      0xabcd,
      Buffer.from([1])
    )
  })

  test('version response and post-TLS flow log', async () => {
    const { session } = make()
    ;(session as unknown as { _proto: unknown })._proto = protoStub()
    ;(session as unknown as { _startTls: Mock })._startTls = vi.fn(async () => {})
    ;(session as unknown as { _sendAA: Mock })._sendAA = vi.fn()
    const ver = Buffer.alloc(6)
    ver.writeUInt16BE(1, 0)
    ver.writeUInt16BE(0, 2)
    ver.writeUInt16BE(0, 4)
    await (
      session as unknown as { _onVersionResponse: (b: Buffer) => Promise<void> }
    )._onVersionResponse(ver)
    await (
      session as unknown as { _onVersionResponse: (b: Buffer) => Promise<void> }
    )._onVersionResponse(Buffer.alloc(2))
    await (session as unknown as { _postTlsSetup: () => Promise<void> })._postTlsSetup()
    ;(session as unknown as { _openChannels: () => void })._openChannels()
  })

  test('start(), SDR, ping and cluster-held logging', async () => {
    vi.useFakeTimers()
    const { session } = make()
    ;(session as unknown as { _sendVersionRequest: Mock })._sendVersionRequest = vi.fn()
    const spy = vi.spyOn(proto, 'loadProtos').mockResolvedValue(protoStub() as never)
    await session.start()
    spy.mockRestore()
    const control = (session as unknown as { _control: EventEmitter })._control
    ;(session as unknown as { _sendAA: Mock })._sendAA = vi.fn()
    control.emit('service-discovery-request', {
      deviceName: 'P',
      deviceBrand: 'B',
      phoneInfo: { instanceId: 'i' }
    })
    control.emit('service-discovery-request', {})
    control.emit('service-discovery-request', { deviceName: 42, phoneInfo: { instanceId: 7 } })
    control.emit('shutdown', 2)
    ;(session as unknown as { close: (r?: string) => void }).close()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  test('VEM, shutdown request and cluster stream logs', async () => {
    vi.useFakeTimers()
    const { session } = make()
    ;(session as unknown as { _state: number })._state = 6
    ;(session as unknown as { _mainFrameSeen: boolean })._mainFrameSeen = true
    capture(session)
    session.sendVehicleEnergyModel(50_000, 30_000, 200_000)
    ;(session as unknown as { _requestClusterStream: () => void })._requestClusterStream()
    ;(session as unknown as { _stopClusterStream: () => void })._stopClusterStream()
    ;(session as unknown as { _state: number })._state = 4
    ;(session as unknown as { _mainFrameSeen: boolean })._mainFrameSeen = false
    ;(session as unknown as { _requestClusterStream: () => void })._requestClusterStream()
    ;(session as unknown as { _state: number })._state = 6
    const p = session.requestShutdown()
    await vi.advanceTimersByTimeAsync(2000)
    await p
    vi.useRealTimers()
  })

  test('requestShutdown logs when the encrypted send throws', async () => {
    vi.useFakeTimers()
    const { session } = make()
    ;(session as unknown as { _state: number })._state = 6
    ;(session as unknown as { _sendEncrypted: Mock })._sendEncrypted = vi.fn(() => {
      throw new Error('closed')
    })
    const p = session.requestShutdown()
    await vi.advanceTimersByTimeAsync(2000)
    await p
    vi.useRealTimers()
  })
})
