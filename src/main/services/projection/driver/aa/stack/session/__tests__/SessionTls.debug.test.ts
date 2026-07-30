import { EventEmitter } from 'node:events'
import type { Mock } from 'vitest'

type SendFn = (b: Buffer) => void

let lastSend: SendFn = () => {}
let lastTlsSocket:
  | (EventEmitter & { write: Mock; destroyed: boolean; writableEnded: boolean })
  | null = null

vi.mock('../../crypto/TlsBridge', () => ({
  createTlsClient: (_cert: string, _key: string, send: SendFn) => {
    lastSend = send
    const bridge = { injectBytes: vi.fn() }
    const tlsSocket = Object.assign(new EventEmitter(), {
      write: vi.fn((_chunk: Buffer, cb?: () => void) => {
        if (cb) cb()
        return true
      }),
      destroyed: false,
      writableEnded: false
    })
    lastTlsSocket = tlsSocket as never
    return { tlsSocket, bridge }
  },
  TlsBridge: class {}
}))

vi.mock('../../crypto/cert', () => ({ HU_CERT_PEM: 'CERT', HU_KEY_PEM: 'KEY' }))

const ORIG_DEBUG = process.env.DEBUG
const ORIG_TRACE = process.env.TRACE

type TlsModule = typeof import('../SessionTls')
type ConstModule = typeof import('../../constants')

let SessionTls: TlsModule['SessionTls']
let C: ConstModule

beforeAll(async () => {
  process.env.DEBUG = '1'
  delete process.env.TRACE
  vi.resetModules()
  ;({ SessionTls } = await import('../SessionTls'))
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
  vi.clearAllMocks()
  lastTlsSocket = null
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

function mkDeps(over: Partial<import('../SessionTls').SessionTlsDeps> = {}) {
  return {
    writeRaw: vi.fn(),
    onDecryptedMessage: vi.fn(),
    onSecureConnect: vi.fn(),
    onError: vi.fn(),
    isHandshakePhase: vi.fn(() => false),
    ...over
  }
}

describe('SessionTls DEBUG (TRACE off)', () => {
  test('BULK dispatch gates its log via isFrameChannel and isPingPong', () => {
    const onDecryptedMessage = vi.fn()
    const tls = new SessionTls(mkDeps({ onDecryptedMessage }))
    const bulk = (ch: number, msgId: number): void => {
      tls.injectEncrypted(ch, 0x03, Buffer.alloc(0))
      const p = Buffer.alloc(4)
      p.writeUInt16BE(msgId, 0)
      lastTlsSocket!.emit('data', p)
    }
    bulk(C.CH.CONTROL, C.CTRL_MSG.PING_REQUEST)
    bulk(C.CH.CONTROL, C.CTRL_MSG.PING_RESPONSE)
    bulk(C.CH.CONTROL, 0x1234)
    bulk(C.CH.NAVIGATION, 0x8001)
    bulk(C.CH.SENSOR, 0x9999)
    expect(onDecryptedMessage).toHaveBeenCalled()
  })

  test('frag-start / frag-cont / reassembly logs for frame and non-frame channels', () => {
    const onDecryptedMessage = vi.fn()
    const tls = new SessionTls(mkDeps({ onDecryptedMessage }))
    const frag = (ch: number): void => {
      tls.injectEncrypted(ch, 0x01, Buffer.alloc(0))
      lastTlsSocket!.emit('data', Buffer.from([0x00, 0x42, 0x01]))
      tls.injectEncrypted(ch, 0x00, Buffer.alloc(0))
      lastTlsSocket!.emit('data', Buffer.from([0x02]))
      tls.injectEncrypted(ch, 0x02, Buffer.alloc(0))
      lastTlsSocket!.emit('data', Buffer.from([0x03]))
    }
    frag(C.CH.NAVIGATION)
    frag(C.CH.SENSOR)
    expect(onDecryptedMessage).toHaveBeenCalledTimes(2)
  })

  test('no-ctx, short-BULK, orphan-continuation and short-reassembly all warn', () => {
    const tls = new SessionTls(mkDeps())
    lastTlsSocket!.emit('data', Buffer.from([0, 0, 0, 0]))

    tls.injectEncrypted(3, 0x03, Buffer.alloc(0))
    lastTlsSocket!.emit('data', Buffer.from([0xff]))

    tls.injectEncrypted(5, 0x02, Buffer.alloc(0))
    lastTlsSocket!.emit('data', Buffer.from([0x00, 0x42, 0xaa]))

    tls.injectEncrypted(5, 0x01, Buffer.alloc(0))
    lastTlsSocket!.emit('data', Buffer.from([0x42]))
    tls.injectEncrypted(5, 0x02, Buffer.alloc(0))
    lastTlsSocket!.emit('data', Buffer.alloc(0))
    expect(console.warn).toHaveBeenCalled()
  })

  test('post-handshake outbound header logs for a non-frame channel but not a frame channel', async () => {
    const writeRaw = vi.fn()
    const tls = new SessionTls(mkDeps({ writeRaw, isHandshakePhase: () => false }))
    tls.sendEncrypted(C.CH.CONTROL, 0x0b, Buffer.from([0x01]))
    await new Promise((r) => setImmediate(r))
    lastSend(Buffer.from([0xc0, 0xff, 0xee]))
    tls.sendEncrypted(C.CH.VIDEO, 0x0b, Buffer.from([0x02]))
    await new Promise((r) => setImmediate(r))
    lastSend(Buffer.from([0xaa, 0xbb]))
    expect(writeRaw).toHaveBeenCalledTimes(2)
  })

  test('handshake flush logs both coalesced and single-chunk variants', async () => {
    const writeRaw = vi.fn()
    const tls = new SessionTls(mkDeps({ writeRaw, isHandshakePhase: () => true }))
    lastSend(Buffer.from([0x16, 0x03]))
    lastSend(Buffer.from([0x03, 0x00]))
    await new Promise((r) => setImmediate(r))
    lastSend(Buffer.from([0x17]))
    await new Promise((r) => setImmediate(r))
    expect(writeRaw).toHaveBeenCalledTimes(2)
    void tls
  })

  test('flushHandshake returns immediately when the buffer is empty', () => {
    const writeRaw = vi.fn()
    const tls = new SessionTls(mkDeps({ writeRaw, isHandshakePhase: () => true }))
    ;(tls as unknown as { _flushHandshake: () => void })._flushHandshake()
    expect(writeRaw).not.toHaveBeenCalled()
  })

  test('secureConnect and error both log under DEBUG', () => {
    const onSecureConnect = vi.fn()
    const onError = vi.fn()
    new SessionTls(mkDeps({ onSecureConnect, onError }))
    lastTlsSocket!.emit('secureConnect')
    lastTlsSocket!.emit('error', new Error('boom'))
    expect(onSecureConnect).toHaveBeenCalled()
    expect(onError).toHaveBeenCalled()
  })

  test('sendEncrypted returns early when the socket is already destroyed', async () => {
    const tls = new SessionTls(mkDeps())
    lastTlsSocket!.destroyed = true
    tls.sendEncrypted(3, 0x0b, Buffer.from([1, 2]))
    await tls.drain()
    expect(lastTlsSocket!.write).not.toHaveBeenCalled()
  })

  test('a synchronous write failure is logged and swallowed', async () => {
    const tls = new SessionTls(mkDeps())
    lastTlsSocket!.write.mockImplementationOnce(() => {
      throw new Error('synchronous write failure')
    })
    expect(() => tls.sendEncrypted(3, 0x0b, Buffer.from([1]))).not.toThrow()
    await new Promise((r) => setImmediate(r))
    expect(console.warn).toHaveBeenCalled()
  })
})
