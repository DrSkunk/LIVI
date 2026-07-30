import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import net from 'node:net'
import { chachaSeal, hkdfSha512, nonce64 } from '../crypto'
import { IapTunnel } from '../iapTunnel'

const SHARED = randomBytes(32)
const SEED = 42n

function readKey(): Buffer {
  return hkdfSha512(SHARED, `DataStream-Salt${SEED}`, 'DataStream-Output-Encryption-Key', 32)
}

function streamFrame(plain: Buffer, counter: bigint): Buffer {
  const len = Buffer.alloc(2)
  len.writeUInt16LE(plain.length, 0)
  const sealed = chachaSeal(readKey(), nonce64(counter), plain, len)
  return Buffer.concat([len, sealed])
}

function pkg(messageType: number, body: Buffer): Buffer {
  const header = Buffer.alloc(32)
  header.writeUInt32BE(32 + body.length, 0)
  header.writeUInt32BE(messageType, 16)
  return Buffer.concat([header, body])
}

const MSG_COMM = 0x636f6d6d

type FakeSocket = EventEmitter & {
  destroy: ReturnType<typeof vi.fn>
  remoteAddress: string
  remotePort: number
}

function fakeSocket(): FakeSocket {
  const sock = new EventEmitter() as FakeSocket
  sock.destroy = vi.fn()
  sock.remoteAddress = '::1'
  sock.remotePort = 6000
  return sock
}

function connect(tunnel: IapTunnel): FakeSocket {
  const sock = fakeSocket()
  ;(tunnel as unknown as { _onConnection(s: net.Socket): void })._onConnection(
    sock as unknown as net.Socket
  )
  return sock
}

let logSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  logSpy.mockRestore()
  warnSpy.mockRestore()
})

describe('IapTunnel listen', () => {
  test('binds a tcp port and resolves it', async () => {
    const tunnel = new IapTunnel(SHARED, SEED)
    const port = await tunnel.listen()
    expect(port).toBeGreaterThan(0)
    tunnel.stop()
  })

  test('rejects when the server errors before listening', async () => {
    const fake = new EventEmitter() as EventEmitter & { listen: (...args: unknown[]) => void }
    fake.listen = () => fake.emit('error', new Error('EADDRINUSE'))
    const spy = vi.spyOn(net, 'createServer').mockReturnValue(fake as unknown as net.Server)
    await expect(new IapTunnel(SHARED, SEED).listen()).rejects.toThrow('EADDRINUSE')
    spy.mockRestore()
  })

  test('resolves 0 when the server reports no address', async () => {
    const fake = new EventEmitter() as EventEmitter & {
      listen: (opts: unknown, cb: () => void) => void
      address: () => null
      close: () => void
    }
    fake.listen = (_opts, cb) => cb()
    fake.address = () => null
    fake.close = vi.fn()
    let onConnection: ((s: net.Socket) => void) | undefined
    const spy = vi.spyOn(net, 'createServer').mockImplementation((handler) => {
      onConnection = handler as (s: net.Socket) => void
      return fake as unknown as net.Server
    })
    const tunnel = new IapTunnel(SHARED, 42)
    await expect(tunnel.listen()).resolves.toBe(0)
    onConnection?.(fakeSocket() as unknown as net.Socket)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('iAP data connection from'))
    tunnel.stop()
    spy.mockRestore()
  })

  test('stop before listen is safe', () => {
    expect(() => new IapTunnel(SHARED, SEED).stop()).not.toThrow()
  })
})

describe('IapTunnel data path', () => {
  test('emits open on connection and relays comm package bodies as iap', () => {
    const tunnel = new IapTunnel(SHARED, SEED)
    const open = vi.fn()
    const iap = vi.fn()
    tunnel.on('open', open)
    tunnel.on('iap', iap)
    const sock = connect(tunnel)
    expect(open).toHaveBeenCalled()
    sock.emit('data', streamFrame(pkg(MSG_COMM, Buffer.from('iap2-bytes')), 0n))
    expect(iap).toHaveBeenCalledWith(Buffer.from('iap2-bytes'))
  })

  test('reassembles frames and packages split across chunks with advancing counters', () => {
    const tunnel = new IapTunnel(SHARED, SEED)
    const iap = vi.fn()
    tunnel.on('iap', iap)
    const sock = connect(tunnel)

    const p1 = pkg(MSG_COMM, Buffer.from('one'))
    const p2 = pkg(MSG_COMM, Buffer.from('two'))
    const f1 = streamFrame(p1, 0n)
    const f2 = streamFrame(p2.subarray(0, 10), 1n)
    const f3 = streamFrame(p2.subarray(10, 33), 2n)
    const f4 = streamFrame(p2.subarray(33), 3n)

    sock.emit('data', f1.subarray(0, 1))
    expect(iap).not.toHaveBeenCalled()
    sock.emit('data', f1.subarray(1, 12))
    expect(iap).not.toHaveBeenCalled()
    sock.emit('data', f1.subarray(12))
    expect(iap).toHaveBeenCalledWith(Buffer.from('one'))

    sock.emit('data', f2)
    expect(iap).toHaveBeenCalledTimes(1)
    sock.emit('data', f3)
    expect(iap).toHaveBeenCalledTimes(1)
    sock.emit('data', f4)
    expect(iap).toHaveBeenCalledWith(Buffer.from('two'))
  })

  test('ignores packages with other message types', () => {
    const tunnel = new IapTunnel(SHARED, SEED)
    const iap = vi.fn()
    tunnel.on('iap', iap)
    const sock = connect(tunnel)
    sock.emit('data', streamFrame(pkg(0x64617461, Buffer.from('other')), 0n))
    expect(iap).not.toHaveBeenCalled()
  })

  test('destroys the connection when a frame fails to authenticate', () => {
    const tunnel = new IapTunnel(SHARED, SEED)
    const sock = connect(tunnel)
    const len = Buffer.from([4, 0])
    sock.emit('data', Buffer.concat([len, randomBytes(20)]))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('stream decrypt failed'))
    expect(sock.destroy).toHaveBeenCalled()
  })

  test('destroys the connection on an implausible package size', () => {
    const tunnel = new IapTunnel(SHARED, SEED)
    const sock = connect(tunnel)
    const bogus = Buffer.alloc(32)
    bogus.writeUInt32BE(8, 0)
    sock.emit('data', streamFrame(bogus, 0n))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('implausible package size'))
    expect(sock.destroy).toHaveBeenCalled()
  })

  test('survives bad data arriving after the socket reference was cleared', () => {
    const tunnel = new IapTunnel(SHARED, SEED)
    const sock = connect(tunnel)
    sock.emit('close')
    const len = Buffer.from([4, 0])
    expect(() => sock.emit('data', Buffer.concat([len, randomBytes(20)]))).not.toThrow()
    expect(sock.destroy).not.toHaveBeenCalled()
  })

  test('logs socket errors', () => {
    const tunnel = new IapTunnel(SHARED, SEED)
    const sock = connect(tunnel)
    sock.emit('error', new Error('reset'))
    expect(warnSpy).toHaveBeenCalledWith('[cpIapTunnel] socket error: reset')
  })

  test('clears the socket and emits closed only for the current connection', () => {
    const tunnel = new IapTunnel(SHARED, SEED)
    const closed = vi.fn()
    tunnel.on('closed', closed)
    const first = connect(tunnel)
    const second = connect(tunnel)
    first.emit('close')
    expect(closed).toHaveBeenCalledTimes(1)
    expect((tunnel as unknown as { _sock: net.Socket | null })._sock).toBe(second)
    second.emit('close')
    expect(closed).toHaveBeenCalledTimes(2)
    expect((tunnel as unknown as { _sock: net.Socket | null })._sock).toBeNull()
  })

  test('stop destroys an open connection', () => {
    const tunnel = new IapTunnel(SHARED, SEED)
    const sock = connect(tunnel)
    tunnel.stop()
    expect(sock.destroy).toHaveBeenCalled()
  })
})
