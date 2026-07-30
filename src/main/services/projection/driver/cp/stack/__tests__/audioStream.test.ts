import { randomBytes } from 'node:crypto'
import dgram from 'node:dgram'
import { EventEmitter } from 'node:events'
import { AudioStream, ntp64Now } from '../audioStream'
import { chachaSeal } from '../crypto'

const KEY = randomBytes(32)

function packet(key: Buffer, sample: number, payload: Buffer, counter: bigint): Buffer {
  const header = Buffer.alloc(12)
  header[0] = 0x80
  header[1] = 96
  header.writeUInt32BE(sample, 4)
  header.writeUInt32BE(0xdeadbeef, 8)
  const nonce8 = Buffer.alloc(8)
  nonce8.writeBigUInt64LE(counter)
  const nonce = Buffer.concat([Buffer.alloc(4), nonce8])
  const sealed = chachaSeal(key, nonce, payload, header.subarray(4, 12))
  return Buffer.concat([header, sealed, nonce8])
}

type Internals = {
  _data: dgram.Socket | null
  _control: dgram.Socket | null
  _onPacket(pkt: Buffer): void
}

function internals(stream: AudioStream): Internals {
  return stream as unknown as Internals
}

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warnSpy.mockRestore()
})

describe('ntp64Now', () => {
  test('returns the current time in the NTP epoch', () => {
    const before = BigInt(Math.floor(Date.now() / 1000) + 2208988800)
    const seconds = ntp64Now() >> 32n
    expect(seconds - before).toBeGreaterThanOrEqual(0n)
    expect(seconds - before).toBeLessThanOrEqual(1n)
  })
})

describe('AudioStream sockets', () => {
  test('listen binds distinct data and control ports', async () => {
    const stream = new AudioStream(KEY, 'main')
    const { dataPort, controlPort } = await stream.listen()
    expect(dataPort).toBeGreaterThan(0)
    expect(controlPort).toBeGreaterThan(0)
    expect(dataPort).not.toBe(controlPort)
    stream.stop()
  })

  test('routes data datagrams into the packet handler and drains control ones', async () => {
    const stream = new AudioStream(KEY, 'main')
    await stream.listen()
    const pcm = vi.fn()
    stream.on('pcm', pcm)
    internals(stream)._data?.emit('message', packet(KEY, 100, Buffer.from('hi'), 0n))
    expect(() => internals(stream)._control?.emit('message', Buffer.from('rtcp'))).not.toThrow()
    expect(pcm).toHaveBeenCalledWith(Buffer.from('hi'))
    stream.stop()
  })

  test('listen rejects when a socket errors before binding', async () => {
    const fake = new EventEmitter() as EventEmitter & { bind: (...args: unknown[]) => void }
    fake.bind = () => fake.emit('error', new Error('EADDRINUSE'))
    const spy = vi.spyOn(dgram, 'createSocket').mockReturnValue(fake as unknown as dgram.Socket)
    await expect(new AudioStream(KEY, 'main').listen()).rejects.toThrow('EADDRINUSE')
    spy.mockRestore()
  })

  test('stop before listen and repeated stop are safe', () => {
    const stream = new AudioStream(KEY, 'main')
    expect(() => stream.stop()).not.toThrow()
    expect(() => stream.stop()).not.toThrow()
  })
})

describe('AudioStream packets', () => {
  test('decrypts payloads, latches active once and pins the media-clock origin', () => {
    const stream = new AudioStream(KEY, 'main')
    const active = vi.fn()
    const pcm = vi.fn()
    stream.on('active', active)
    stream.on('pcm', pcm)
    expect(stream.getOrigin()).toBeNull()

    internals(stream)._onPacket(packet(KEY, 4711, Buffer.from('first'), 0n))
    expect(active).toHaveBeenCalledTimes(1)
    expect(active).toHaveBeenCalledWith(true)
    expect(pcm).toHaveBeenCalledWith(Buffer.from('first'))
    expect(stream.getOrigin()?.firstSample).toBe(4711)
    expect(stream.getOrigin()?.originNs).toBeGreaterThan(0n)
    expect(stream.getLastRecvSample()).toBe(4711)

    internals(stream)._onPacket(packet(KEY, 5000, Buffer.from('second'), 1n))
    expect(active).toHaveBeenCalledTimes(1)
    expect(stream.getOrigin()?.firstSample).toBe(4711)
    expect(stream.getLastRecvSample()).toBe(5000)
  })

  test('emits the reconstructed RTP packet only when someone listens', () => {
    const stream = new AudioStream(KEY, 'main')
    const rtp = vi.fn()
    stream.on('rtp', rtp)
    const pkt = packet(KEY, 7, Buffer.from('payload'), 0n)
    internals(stream)._onPacket(pkt)
    expect(rtp).toHaveBeenCalledWith(Buffer.concat([pkt.subarray(0, 12), Buffer.from('payload')]))
  })

  test('ignores packets shorter than header plus tail', () => {
    const stream = new AudioStream(KEY, 'main')
    const pcm = vi.fn()
    stream.on('pcm', pcm)
    internals(stream)._onPacket(Buffer.alloc(35))
    expect(pcm).not.toHaveBeenCalled()
  })

  test('drops packets that fail to decrypt', () => {
    const stream = new AudioStream(KEY, 'main')
    const pcm = vi.fn()
    const active = vi.fn()
    stream.on('pcm', pcm)
    stream.on('active', active)
    internals(stream)._onPacket(packet(randomBytes(32), 1, Buffer.from('x'), 0n))
    expect(pcm).not.toHaveBeenCalled()
    expect(active).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('decrypt failed'))
  })

  test('stop emits active false only when the stream was active', async () => {
    const stream = new AudioStream(KEY, 'main')
    await stream.listen()
    const active = vi.fn()
    stream.on('active', active)
    internals(stream)._onPacket(packet(KEY, 1, Buffer.from('x'), 0n))
    stream.stop()
    expect(active).toHaveBeenNthCalledWith(1, true)
    expect(active).toHaveBeenNthCalledWith(2, false)
    stream.stop()
    expect(active).toHaveBeenCalledTimes(2)
  })
})
