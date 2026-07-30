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
  process.env.TRACE = '1'
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

describe('SessionTls DEBUG + TRACE', () => {
  test('every log path fires unconditionally on a frame channel', async () => {
    const onDecryptedMessage = vi.fn()
    const writeRaw = vi.fn()
    const tls = new SessionTls(mkDeps({ onDecryptedMessage, writeRaw }))

    tls.injectEncrypted(C.CH.VIDEO, 0x03, Buffer.alloc(0))
    const bulk = Buffer.alloc(4)
    bulk.writeUInt16BE(0x0001, 0)
    lastTlsSocket!.emit('data', bulk)

    tls.injectEncrypted(C.CH.VIDEO, 0x01, Buffer.alloc(0))
    lastTlsSocket!.emit('data', Buffer.from([0x00, 0x01, 0xaa]))
    tls.injectEncrypted(C.CH.VIDEO, 0x00, Buffer.alloc(0))
    lastTlsSocket!.emit('data', Buffer.from([0xbb]))
    tls.injectEncrypted(C.CH.VIDEO, 0x02, Buffer.alloc(0))
    lastTlsSocket!.emit('data', Buffer.from([0xcc]))

    tls.sendEncrypted(C.CH.VIDEO, 0x0b, Buffer.from([0x01]))
    await new Promise((r) => setImmediate(r))
    lastSend(Buffer.from([0xc0, 0xff, 0xee]))

    expect(onDecryptedMessage).toHaveBeenCalled()
    expect(writeRaw).toHaveBeenCalled()
  })
})
