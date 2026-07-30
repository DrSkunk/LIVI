import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import net from 'node:net'
import { chachaSeal, nonce64 } from '../crypto'
import { ScreenStream } from '../screenStream'

const KEY = randomBytes(32)

type FakeSocket = EventEmitter & {
  destroy: ReturnType<typeof vi.fn>
  remoteAddress: string
  remotePort: number
}

function fakeSocket(): FakeSocket {
  const sock = new EventEmitter() as FakeSocket
  sock.destroy = vi.fn()
  sock.remoteAddress = '::1'
  sock.remotePort = 5000
  return sock
}

function connect(stream: ScreenStream): FakeSocket {
  const sock = fakeSocket()
  ;(stream as unknown as { _onConnection(s: net.Socket): void })._onConnection(
    sock as unknown as net.Socket
  )
  return sock
}

function message(opcode: number, body: Buffer): Buffer {
  const header = Buffer.alloc(128)
  header.writeUInt32LE(body.length, 0)
  header[4] = opcode
  return Buffer.concat([header, body])
}

function frameMessage(payload: Buffer, counter: bigint): Buffer {
  const header = Buffer.alloc(128)
  header[4] = 0
  header.writeUInt32LE(payload.length + 16, 0)
  const sealed = chachaSeal(KEY, nonce64(counter), payload, header)
  return Buffer.concat([header, sealed])
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

describe('ScreenStream listen', () => {
  test('binds a tcp port and resolves it', async () => {
    const stream = new ScreenStream(KEY)
    const port = await stream.listen()
    expect(port).toBeGreaterThan(0)
    stream.stop()
  })

  test('rejects when the server errors before listening', async () => {
    const fake = new EventEmitter() as EventEmitter & { listen: (...args: unknown[]) => void }
    fake.listen = () => fake.emit('error', new Error('EADDRINUSE'))
    const spy = vi.spyOn(net, 'createServer').mockReturnValue(fake as unknown as net.Server)
    await expect(new ScreenStream(KEY).listen()).rejects.toThrow('EADDRINUSE')
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
    const stream = new ScreenStream(KEY)
    await expect(stream.listen()).resolves.toBe(0)
    onConnection?.(fakeSocket() as unknown as net.Socket)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('video data connection from'))
    stream.stop()
    spy.mockRestore()
  })

  test('stop before listen is safe', () => {
    expect(() => new ScreenStream(KEY).stop()).not.toThrow()
  })
})

describe('ScreenStream messages', () => {
  test('emits codec and codec_data for a video config', () => {
    const stream = new ScreenStream(KEY)
    const sock = connect(stream)
    const codec = vi.fn()
    const config = vi.fn()
    stream.on('codec', codec)
    stream.on('config', config)
    const avcc = Buffer.from([0x01, 0x64, 0x00, 0x1f, 0xff])
    const body = Buffer.concat([Buffer.alloc(4), Buffer.from('avcC'), avcc])
    sock.emit('data', message(1, body))
    expect(codec).toHaveBeenCalledWith('h264')
    expect(config).toHaveBeenCalledWith(avcc)
  })

  test('decrypts video frames with an advancing counter, honoring chunked delivery', () => {
    const stream = new ScreenStream(KEY)
    const sock = connect(stream)
    const frames: Buffer[] = []
    stream.on('frame', (f: Buffer) => frames.push(f))

    const first = frameMessage(Buffer.from('frame-one'), 0n)
    sock.emit('data', first.subarray(0, 100))
    expect(frames).toHaveLength(0)
    sock.emit('data', first.subarray(100, 130))
    expect(frames).toHaveLength(0)
    sock.emit('data', first.subarray(130))
    expect(frames).toEqual([Buffer.from('frame-one')])

    sock.emit('data', frameMessage(Buffer.from('frame-two'), 1n))
    expect(frames).toEqual([Buffer.from('frame-one'), Buffer.from('frame-two')])
  })

  test('passes short frame bodies through without decryption', () => {
    const stream = new ScreenStream(KEY)
    const sock = connect(stream)
    const frame = vi.fn()
    stream.on('frame', frame)
    sock.emit('data', message(0, Buffer.from('tiny')))
    expect(frame).toHaveBeenCalledWith(Buffer.from('tiny'))
  })

  test('ignores keep-alive style opcodes', () => {
    const stream = new ScreenStream(KEY)
    const sock = connect(stream)
    const frame = vi.fn()
    stream.on('frame', frame)
    sock.emit('data', message(4, Buffer.from('ping')))
    expect(frame).not.toHaveBeenCalled()
  })

  test('warns and keeps parsing when a frame fails to decrypt', () => {
    const stream = new ScreenStream(KEY)
    const sock = connect(stream)
    const frame = vi.fn()
    stream.on('frame', frame)
    const bad = message(0, randomBytes(32))
    const good = frameMessage(Buffer.from('ok'), 0n)
    sock.emit('data', Buffer.concat([bad, good]))
    expect(warnSpy).toHaveBeenCalledWith('[cpScreen] frame error:', expect.any(String))
    expect(frame).toHaveBeenCalledWith(Buffer.from('ok'))
  })

  test('drops the connection on an implausible body size', () => {
    const stream = new ScreenStream(KEY)
    const sock = connect(stream)
    const header = Buffer.alloc(128)
    header.writeUInt32LE(9 * 1024 * 1024, 0)
    sock.emit('data', header)
    expect(sock.destroy).toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('implausible bodySize'))
  })

  test('logs socket errors and close events', () => {
    const stream = new ScreenStream(KEY)
    const sock = connect(stream)
    sock.emit('error', new Error('reset'))
    expect(warnSpy).toHaveBeenCalledWith('[cpScreen] socket error: reset')
    sock.emit('close')
    expect(logSpy).toHaveBeenCalledWith('[cpScreen] video data connection closed')
  })
})
