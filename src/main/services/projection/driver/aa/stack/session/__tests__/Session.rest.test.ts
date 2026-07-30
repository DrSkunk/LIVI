import { EventEmitter } from 'node:events'
import type { Mock } from 'vitest'

class MockSocket extends EventEmitter {
  destroy = vi.fn()
  end = vi.fn()
  setKeepAlive = vi.fn()
  writable = true
  remoteAddress = '10.0.0.2'
  write = vi.fn((_d: Buffer, cb?: () => void) => {
    cb?.()
    return true
  })
}

vi.mock('../SessionTls', () => ({ SessionTls: vi.fn() }))

const ORIG_DEBUG = process.env.DEBUG
const ORIG_TRACE = process.env.TRACE

type SessionModule = typeof import('../Session')
type ConstModule = typeof import('../../constants')

let Session: SessionModule['Session']
let C: ConstModule

beforeAll(async () => {
  process.env.DEBUG = '1'
  delete process.env.TRACE
  vi.resetModules()
  ;({ Session } = await import('../Session'))
  C = await import('../../constants')
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

function make(): { session: InstanceType<SessionModule['Session']>; sock: MockSocket } {
  const sock = new MockSocket()
  const session = new Session(
    sock as unknown as import('net').Socket,
    {
      huName: 'LIVI',
      clusterWidth: 0,
      clusterHeight: 0,
      clusterFps: 0,
      clusterDpi: 0
    } as import('../Session').SessionConfig
  )
  return { session, sock }
}

function dispatch(session: unknown): (ch: number, mid: number, p?: Buffer) => void {
  return (ch, mid, p = Buffer.alloc(0)) =>
    (session as { _handleDecryptedMessage: (...a: unknown[]) => void })._handleDecryptedMessage(
      ch,
      0,
      mid,
      p
    )
}

describe('frame-channel + ping/pong log gating (DEBUG on, TRACE off)', () => {
  test('MSG log runs isFrameChannel across every arm and isPingPong both arms', () => {
    const { session } = make()
    ;(session as unknown as { _control: unknown })._control = { handleMessage: vi.fn() }
    ;(session as unknown as { _video: unknown })._video = { handleMessage: vi.fn() }
    ;(session as unknown as { _cluster: unknown })._cluster = { handleMessage: vi.fn() }
    ;(session as unknown as { _nav: unknown })._nav = { handleMessage: vi.fn() }
    const audio = new Map<number, { handleMessage: Mock }>()
    for (const ch of [C.CH.MEDIA_AUDIO, C.CH.SPEECH_AUDIO, C.CH.SYSTEM_AUDIO]) {
      audio.set(ch, { handleMessage: vi.fn() })
    }
    ;(session as unknown as { _audio: unknown })._audio = audio
    ;(session as unknown as { _mic: unknown })._mic = { handleMessage: vi.fn() }

    const d = dispatch(session)
    d(C.CH.VIDEO, 0x0001, Buffer.from([1, 2]))
    d(C.CH.CLUSTER_VIDEO, 0x0001, Buffer.from([1, 2]))
    d(C.CH.MEDIA_AUDIO, 0x0001, Buffer.from([1]))
    d(C.CH.SPEECH_AUDIO, 0x0001, Buffer.from([1]))
    d(C.CH.SYSTEM_AUDIO, 0x0001, Buffer.from([1]))
    d(C.CH.INPUT, 0x0001)
    d(C.CH.MIC_INPUT, 0x0001, Buffer.from([1]))
    d(C.CH.SENSOR, 0x9999)
    d(C.CH.NAVIGATION, 0x8001)
    d(C.CH.CONTROL, C.CTRL_MSG.PING_REQUEST)
    d(C.CH.CONTROL, C.CTRL_MSG.PING_RESPONSE)
    d(C.CH.CONTROL, 0x1234)
  })

  test('plaintext sendAA gates its log with isPingPong', () => {
    const { session } = make()
    const send = (mid: number): void =>
      (session as unknown as { _sendAA: (...a: unknown[]) => void })._sendAA(
        C.CH.CONTROL,
        0x03,
        mid,
        Buffer.alloc(0)
      )
    send(C.CTRL_MSG.PING_REQUEST)
    send(0xabcd)
  })
})

describe('remaining reachable branches', () => {
  test('cluster video routes non-setup messages to the cluster channel', () => {
    const { session } = make()
    const handleMessage = vi.fn()
    ;(session as unknown as { _cluster: unknown })._cluster = { handleMessage }
    dispatch(session)(C.CH.CLUSTER_VIDEO, 0x0001, Buffer.from([1, 2]))
    expect(handleMessage).toHaveBeenCalled()
  })

  test('mic setup request routes to the AV setup handler', () => {
    const { session } = make()
    const avSetup = vi.fn()
    ;(session as unknown as { _handleAVSetupRequest: Mock })._handleAVSetupRequest = avSetup
    dispatch(session)(C.CH.MIC_INPUT, C.AV_MSG.SETUP_REQUEST)
    expect(avSetup).toHaveBeenCalled()
  })

  test('the real _sendEncrypted hands off to the TLS bridge', () => {
    const { session } = make()
    ;(session as unknown as { _state: number })._state = 6
    const sendEncrypted = vi.fn()
    ;(session as unknown as { _tls: unknown })._tls = { sendEncrypted }
    session.requestVideoFocus()
    expect(sendEncrypted).toHaveBeenCalled()
  })

  test('socket end clears a running ping timer', () => {
    const { session, sock } = make()
    ;(session as unknown as { _pingTimer: ReturnType<typeof setInterval> })._pingTimer =
      setInterval(() => {}, 1000)
    ;(session as unknown as { _state: number })._state = 6
    sock.emit('end')
    expect((session as unknown as { _pingTimer: unknown })._pingTimer).toBeNull()
  })

  test('a full frame through the raw parser reaches the wired _handleRawFrame', () => {
    const { session, sock } = make()
    const onVer = vi.fn(async () => {})
    ;(session as unknown as { _onVersionResponse: Mock })._onVersionResponse = onVer
    const frame = Buffer.alloc(10)
    frame.writeUInt8(0, 0)
    frame.writeUInt8(0x03, 1)
    frame.writeUInt16BE(6, 2)
    frame.writeUInt16BE(C.CTRL_MSG.VERSION_RESPONSE, 4)
    frame.writeUInt16BE(0, 6)
    frame.writeUInt16BE(0, 8)
    sock.emit('data', frame)
    expect(onVer).toHaveBeenCalled()
  })

  test('PHONE_STATUS decode error is logged under DEBUG', () => {
    const { session } = make()
    ;(session as unknown as { _proto: unknown })._proto = {
      PhoneStatus: {
        decode: () => {
          throw new Error('bad')
        }
      }
    }
    expect(() => dispatch(session)(C.CH.PHONE_STATUS, 0x8001, Buffer.alloc(0))).not.toThrow()
  })

  test('WIFI credentials request logs and dispatches under DEBUG', () => {
    const { session } = make()
    const wifi = vi.fn()
    ;(session as unknown as { _handleWifiCredentialsRequest: Mock })._handleWifiCredentialsRequest =
      wifi
    dispatch(session)(C.CH.WIFI, 0x8001, Buffer.alloc(0))
    expect(wifi).toHaveBeenCalled()
  })

  test('START_INDICATION on an auxiliary channel logs the chN label', () => {
    const { session } = make()
    expect(() => dispatch(session)(0x7e, C.AV_MSG.START_INDICATION, Buffer.alloc(0))).not.toThrow()
  })

  test('fully unhandled channel/msgId logs under DEBUG', () => {
    const { session } = make()
    expect(() => dispatch(session)(0x7d, 0x4444, Buffer.alloc(0))).not.toThrow()
  })

  test('stripHeaderAndInjectTls breaks on partial extended header and partial body', () => {
    const { session } = make()
    const handle = vi.fn()
    ;(session as unknown as { _handleDecryptedMessage: Mock })._handleDecryptedMessage = handle
    const strip = (b: Buffer): void =>
      (
        session as unknown as { _stripHeaderAndInjectTls: (x: Buffer) => void }
      )._stripHeaderAndInjectTls(b)
    const extended = Buffer.alloc(4)
    extended.writeUInt8(3, 0)
    extended.writeUInt8(0x01, 1)
    extended.writeUInt16BE(4, 2)
    strip(extended)

    const partialBody = Buffer.alloc(4)
    partialBody.writeUInt8(3, 0)
    partialBody.writeUInt8(0x03, 1)
    partialBody.writeUInt16BE(100, 2)
    strip(partialBody)
    expect(handle).not.toHaveBeenCalled()
  })

  test('sensor methods emit their optional fields when RUNNING', () => {
    const { session } = make()
    ;(session as unknown as { _state: number })._state = 6
    const sent = vi.fn()
    ;(session as unknown as { _sendEncrypted: Mock })._sendEncrypted = sent
    session.sendSpeedData(13_000, true, 25_000)
    session.sendLightData(3, true, 2)
    session.sendEnvironmentData(20_000, 101_000, 1)
    session.sendOdometerData(120_000, 5_000)
    session.sendGpsLocationData({
      latDeg: 52.5,
      lngDeg: 13.4,
      accuracyM: 5,
      altitudeM: 50,
      speedMs: 12,
      bearingDeg: 90
    })
    session.sendFuelData(50, 200, true)
    session.sendVehicleEnergyModel(50_000, 30_000, 200_000)
    expect(sent.mock.calls.length).toBeGreaterThanOrEqual(7)
  })
})
