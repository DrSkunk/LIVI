import { randomBytes } from 'node:crypto'
import dgram from 'node:dgram'
import { chachaOpen } from '../crypto'
import { CpMicUplink, type CpMicUplinkOpts } from '../micUplink'
import { CpMicUplinkEncoder } from '../micUplinkEncoder'

vi.mock('../micUplinkEncoder', async () => {
  const { EventEmitter } = await import('node:events')
  class FakeEncoder extends EventEmitter {
    static instances: FakeEncoder[] = []
    static failNext = false
    opts: unknown
    start = vi.fn(async () => {
      if (FakeEncoder.failNext) {
        FakeEncoder.failNext = false
        throw new Error('no gst')
      }
      return true
    })
    stop = vi.fn()
    write = vi.fn()
    constructor(opts: unknown) {
      super()
      this.opts = opts
      FakeEncoder.instances.push(this)
    }
  }
  return { CpMicUplinkEncoder: FakeEncoder }
})

type FakeEncoderClass = typeof CpMicUplinkEncoder & {
  instances: Array<
    InstanceType<typeof CpMicUplinkEncoder> & {
      start: ReturnType<typeof vi.fn>
      stop: ReturnType<typeof vi.fn>
      write: ReturnType<typeof vi.fn>
      opts: CpMicUplinkOpts
    }
  >
  failNext: boolean
}

const FakeEncoder = CpMicUplinkEncoder as FakeEncoderClass

const KEY = randomBytes(32)

function opts(overrides: Partial<CpMicUplinkOpts> = {}): CpMicUplinkOpts {
  return {
    key: KEY,
    host: 'fe80::1',
    port: 7788,
    sampleRate: 16000,
    channels: 1,
    payloadType: 0x66,
    codec: 'pcm',
    frameMs: 20,
    bitrate: 48000,
    label: 'mic',
    ...overrides
  }
}

type FakeSock = {
  on: ReturnType<typeof vi.fn>
  bind: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
}

function fakeSock(): FakeSock {
  return { on: vi.fn(), bind: vi.fn(), send: vi.fn(), close: vi.fn() }
}

function sentPacket(sock: FakeSock, call = 0): { header: Buffer; body: Buffer; nonce: bigint } {
  const [pkt, port, host] = sock.send.mock.calls[call] as [Buffer, number, string]
  expect(port).toBe(7788)
  expect(host).toBe('fe80::1')
  const header = pkt.subarray(0, 12)
  const nonce8 = pkt.subarray(pkt.length - 8)
  const sealed = pkt.subarray(12, pkt.length - 8)
  const nonce12 = Buffer.concat([Buffer.alloc(4), nonce8])
  const body = chachaOpen(KEY, nonce12, sealed, header.subarray(4, 12))
  return { header, body, nonce: nonce8.readBigUInt64LE() }
}

let createSpy: ReturnType<typeof vi.spyOn>
let sock: FakeSock

beforeEach(() => {
  FakeEncoder.instances.length = 0
  sock = fakeSock()
  createSpy = vi.spyOn(dgram, 'createSocket').mockReturnValue(sock as unknown as dgram.Socket)
})

afterEach(() => {
  createSpy.mockRestore()
})

describe('CpMicUplink pcm passthrough', () => {
  test('start binds a socket once and swallows socket errors', () => {
    const uplink = new CpMicUplink(opts())
    uplink.start()
    uplink.start()
    expect(createSpy).toHaveBeenCalledTimes(1)
    expect(sock.bind).toHaveBeenCalledWith(0, '::')
    const errorHandler = sock.on.mock.calls[0][1] as () => void
    expect(() => errorHandler()).not.toThrow()
    expect(FakeEncoder.instances).toHaveLength(0)
  })

  test('frames pcm at samples-per-packet and seals each frame', () => {
    const uplink = new CpMicUplink(opts())
    uplink.start()
    const frameBytes = 320 * 2
    const pcm = Buffer.alloc(frameBytes + frameBytes / 2)
    for (let i = 0; i < pcm.length; i += 2) pcm.writeUInt16LE(0x1122, i)
    uplink.write(pcm)
    expect(sock.send).toHaveBeenCalledTimes(1)

    const { header, body, nonce } = sentPacket(sock)
    expect(header[0]).toBe(0x80)
    expect(header[1]).toBe(0x66)
    expect(header.readUInt16BE(2)).toBe(0)
    expect(header.readUInt32BE(4)).toBe(0)
    expect(header.readUInt32BE(8)).toBe(0)
    expect(nonce).toBe(0n)
    expect(body.length).toBe(frameBytes)
    expect(body.readUInt16BE(0)).toBe(0x1122)

    uplink.write(Buffer.alloc(frameBytes / 2))
    expect(sock.send).toHaveBeenCalledTimes(2)
    const second = sentPacket(sock, 1)
    expect(second.header.readUInt16BE(2)).toBe(1)
    expect(second.header.readUInt32BE(4)).toBe(320)
    expect(second.nonce).toBe(1n)
  })

  test('write before start is a no-op', () => {
    const uplink = new CpMicUplink(opts())
    uplink.write(Buffer.alloc(4096))
    expect(sock.send).not.toHaveBeenCalled()
  })

  test('stop closes the socket and clears buffered pcm', () => {
    const uplink = new CpMicUplink(opts())
    uplink.start()
    uplink.write(Buffer.alloc(100))
    uplink.stop()
    expect(sock.close).toHaveBeenCalled()
    uplink.write(Buffer.alloc(4096))
    expect(sock.send).not.toHaveBeenCalled()
    expect(() => uplink.stop()).not.toThrow()
  })
})

describe('CpMicUplink opus uplink', () => {
  test('start spawns an encoder and sends its frames unswapped', () => {
    const uplink = new CpMicUplink(opts({ codec: 'opus', sampleRate: 48000, bitrate: 96000 }))
    uplink.start()
    const enc = FakeEncoder.instances[0]
    expect(enc.opts).toEqual({
      sampleRate: 48000,
      channels: 1,
      bitrate: 96000,
      frameMs: 20,
      label: 'mic'
    })
    expect(enc.start).toHaveBeenCalled()

    enc.emit('opus', Buffer.from([1, 2, 3, 4]))
    const { body, header } = sentPacket(sock)
    expect(body.equals(Buffer.from([1, 2, 3, 4]))).toBe(true)
    expect(header.readUInt32BE(4)).toBe(0)
  })

  test('write forwards pcm to the encoder instead of sending', () => {
    const uplink = new CpMicUplink(opts({ codec: 'opus' }))
    uplink.start()
    const enc = FakeEncoder.instances[0]
    uplink.write(Buffer.alloc(4096))
    expect(enc.write).toHaveBeenCalledWith(Buffer.alloc(4096))
    expect(sock.send).not.toHaveBeenCalled()
  })

  test('warns when the encoder fails to start', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    FakeEncoder.failNext = true
    const uplink = new CpMicUplink(opts({ codec: 'opus' }))
    uplink.start()
    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalledWith('[cpMicUplink:mic] encoder start failed: no gst')
    })
    uplink.stop()
    warnSpy.mockRestore()
  })

  test('drops encoder frames arriving after stop', () => {
    const uplink = new CpMicUplink(opts({ codec: 'opus' }))
    uplink.start()
    const enc = FakeEncoder.instances[0]
    uplink.stop()
    expect(enc.stop).toHaveBeenCalled()
    enc.emit('opus', Buffer.from([9]))
    expect(sock.send).not.toHaveBeenCalled()
  })
})
