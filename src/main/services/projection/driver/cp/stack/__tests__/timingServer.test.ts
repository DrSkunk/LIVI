import dgram from 'node:dgram'
import { EventEmitter } from 'node:events'
import { TimingSync } from '../timingServer'

type FakeSock = { send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }

type TimingInternals = {
  _sock: FakeSock | null
  _peerPort: number
  _onMessage(msg: Buffer, rinfo: { address: string; port: number }): void
  _sendRequest(): void
}

function internals(sync: TimingSync): TimingInternals {
  return sync as unknown as TimingInternals
}

function writeNtp(buf: Buffer, offset: number, ntp: bigint): void {
  buf.writeUInt32BE(Number(ntp >> 32n) >>> 0, offset)
  buf.writeUInt32BE(Number(ntp & 0xffffffffn) >>> 0, offset + 4)
}

function response(t1: bigint, t2: bigint, t3: bigint): Buffer {
  const msg = Buffer.alloc(32)
  msg[0] = 0x80
  msg[1] = 211
  writeNtp(msg, 8, t1)
  writeNtp(msg, 16, t2)
  writeNtp(msg, 24, t3)
  return msg
}

function lastRequestT1(sock: FakeSock): bigint {
  const pkt = sock.send.mock.calls.at(-1)?.[0] as Buffer
  return (BigInt(pkt.readUInt32BE(24)) << 32n) | BigInt(pkt.readUInt32BE(28))
}

function respond(sync: TimingSync, sock: FakeSock, offsetNtp: bigint, rttNtp: bigint): void {
  internals(sync)._sendRequest()
  const t1 = lastRequestT1(sock)
  const t2 = t1 + offsetNtp + rttNtp / 2n
  const t3 = t1 + offsetNtp - rttNtp / 2n
  internals(sync)._onMessage(response(t1, t2, t3), RINFO)
}

function prepared(): { sync: TimingSync; sock: FakeSock } {
  const sync = new TimingSync()
  const sock = { send: vi.fn(), close: vi.fn() }
  internals(sync)._sock = sock
  internals(sync)._peerPort = 7010
  return { sync, sock }
}

const RINFO = { address: '::1', port: 7011 }
const TWO32 = 4294967296n

let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  logSpy.mockRestore()
  vi.useRealTimers()
})

describe('TimingSync sockets', () => {
  test('listen binds a udp socket and resolves the port', async () => {
    const sync = new TimingSync()
    const port = await sync.listen()
    expect(port).toBeGreaterThan(0)
    sync.stop()
  })

  test('listen rejects when the socket errors before binding', async () => {
    const fake = new EventEmitter() as EventEmitter & { bind: (...args: unknown[]) => void }
    fake.bind = () => fake.emit('error', new Error('EADDRINUSE'))
    const spy = vi.spyOn(dgram, 'createSocket').mockReturnValue(fake as unknown as dgram.Socket)
    await expect(new TimingSync().listen()).rejects.toThrow('EADDRINUSE')
    spy.mockRestore()
  })

  test('routes datagrams from the socket into the handler', async () => {
    const sync = new TimingSync()
    await sync.listen()
    const sockRef = (sync as unknown as { _sock: dgram.Socket })._sock
    expect(() => sockRef.emit('message', Buffer.alloc(8), RINFO)).not.toThrow()
    sync.stop()
  })

  test('stop without listen or start is safe', () => {
    expect(() => new TimingSync().stop()).not.toThrow()
  })
})

describe('request scheduling', () => {
  test('start sends a request immediately and then every second', () => {
    vi.useFakeTimers()
    const { sync, sock } = prepared()
    sync.start('fe80::1', 7010)
    expect(sock.send).toHaveBeenCalledTimes(1)
    const pkt = sock.send.mock.calls[0][0] as Buffer
    expect(pkt.length).toBe(32)
    expect(pkt[0]).toBe(0x80)
    expect(pkt[1]).toBe(210)
    expect(pkt.readUInt16BE(2)).toBe(7)
    expect(lastRequestT1(sock)).toBeGreaterThan(0n)
    vi.advanceTimersByTime(2000)
    expect(sock.send).toHaveBeenCalledTimes(3)
    sync.stop()
    vi.advanceTimersByTime(2000)
    expect(sock.send).toHaveBeenCalledTimes(3)
  })

  test('does not send without a socket or peer port', () => {
    const sync = new TimingSync()
    expect(() => internals(sync)._sendRequest()).not.toThrow()
    const { sync: idle, sock } = prepared()
    internals(idle)._peerPort = 0
    internals(idle)._sendRequest()
    expect(sock.send).not.toHaveBeenCalled()
  })
})

describe('answering phone-driven sync requests', () => {
  test('echoes the request transmit time and stamps T2/T3', () => {
    const { sync, sock } = prepared()
    const reqMsg = Buffer.alloc(32)
    reqMsg[1] = 210
    writeNtp(reqMsg, 24, 0x1122334455667788n)
    internals(sync)._onMessage(reqMsg, RINFO)
    const [resp, port, address] = sock.send.mock.calls[0]
    expect(port).toBe(RINFO.port)
    expect(address).toBe(RINFO.address)
    expect((resp as Buffer)[1]).toBe(211)
    expect((resp as Buffer).subarray(8, 16).equals(reqMsg.subarray(24, 32))).toBe(true)
    expect((resp as Buffer).readUInt32BE(16)).toBeGreaterThan(0)
    expect((resp as Buffer).readUInt32BE(24)).toBeGreaterThan(0)
  })

  test('ignores requests once the socket is gone', () => {
    const sync = new TimingSync()
    const reqMsg = Buffer.alloc(32)
    reqMsg[1] = 210
    expect(() => internals(sync)._onMessage(reqMsg, RINFO)).not.toThrow()
  })
})

describe('processing sync responses', () => {
  test('steps the steered clock by the measured offset on first lock', () => {
    const { sync, sock } = prepared()
    const before = sync.syncedNtp()
    respond(sync, sock, 10n * TWO32, 2n * TWO32)
    respond(sync, sock, 10n * TWO32, 2n * TWO32)
    const shift = sync.syncedNtp() - before
    expect(shift).toBeGreaterThan(9n * TWO32)
    expect(shift).toBeLessThan(11n * TWO32)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('synced'))
  })

  test('slews small offsets once locked and steps large ones again', () => {
    const { sync, sock } = prepared()
    respond(sync, sock, 0n, 4n * TWO32)
    respond(sync, sock, 0n, 4n * TWO32)
    logSpy.mockClear()

    const before = sync.syncedNtp()
    const small = TWO32 / 100n
    respond(sync, sock, small, 3n * TWO32)
    respond(sync, sock, small, 3n * TWO32)
    const slewed = sync.syncedNtp() - before
    expect(slewed).toBeLessThan(small)
    expect(logSpy).not.toHaveBeenCalled()

    respond(sync, sock, 5n * TWO32, 2n * TWO32)
    respond(sync, sock, 5n * TWO32, 2n * TWO32)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('stepped'))
  })

  test('drops short, unsolicited, mismatched and negative-rtt responses', () => {
    const { sync, sock } = prepared()
    const before = sync.syncedNtp()

    internals(sync)._onMessage(Buffer.alloc(8), RINFO)
    const unknownType = Buffer.alloc(32)
    unknownType[1] = 199
    internals(sync)._onMessage(unknownType, RINFO)
    internals(sync)._onMessage(response(1n, 2n, 3n), RINFO)

    internals(sync)._sendRequest()
    let t1 = lastRequestT1(sock)
    internals(sync)._onMessage(response(t1 + 1n, t1, t1), RINFO)

    internals(sync)._sendRequest()
    t1 = lastRequestT1(sock)
    internals(sync)._onMessage(response(t1, t1 + 3600n * TWO32, t1 + 7200n * TWO32), RINFO)

    const drift = sync.syncedNtp() - before
    expect(drift).toBeLessThan(TWO32)
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('stepped'))
  })

  test('keeps only the lowest-rtt sample of each pick group', () => {
    const { sync, sock } = prepared()
    respond(sync, sock, 0n, 4n * TWO32)
    respond(sync, sock, 0n, 4n * TWO32)
    logSpy.mockClear()

    const before = sync.syncedNtp()
    respond(sync, sock, 60n * TWO32, TWO32)
    respond(sync, sock, 120n * TWO32, 2n * TWO32)
    const shift = sync.syncedNtp() - before
    expect(shift).toBeGreaterThan(59n * TWO32)
    expect(shift).toBeLessThan(61n * TWO32)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('stepped'))
  })

  test('discards a pick group whose rtt is worse than the recent window', () => {
    const { sync, sock } = prepared()
    respond(sync, sock, 0n, 4n * TWO32)
    respond(sync, sock, 0n, 4n * TWO32)
    respond(sync, sock, 0n, TWO32)
    respond(sync, sock, 0n, TWO32)
    logSpy.mockClear()

    const before = sync.syncedNtp()
    respond(sync, sock, 10n * TWO32, 3n * TWO32)
    respond(sync, sock, 10n * TWO32, 3n * TWO32)
    expect(logSpy).not.toHaveBeenCalled()
    expect(sync.syncedNtp() - before).toBeLessThan(TWO32)
  })
})
