import { EventEmitter } from 'node:events'

// ── WebUSB-shaped device mock (usb@3 / node-usb-rs) ────────────────────────────
//
// The bridge talks to a `USBDevice`: async open/close/reset, selectConfiguration,
// claimInterface/releaseInterface, transferIn/transferOut, clearHalt. Endpoints
// live under configuration.interfaces[].alternate.endpoints[] with { type,
// direction, endpointNumber }.

class MockDevice {
  vendorId = 0x18d1
  productId = 0x4ee1

  configuration: USBConfiguration | undefined

  open = vi.fn(async () => undefined)
  close = vi.fn(async () => undefined)
  reset = vi.fn(async () => undefined)
  selectConfiguration = vi.fn(async (value: number) => {
    this.configuration = makeConfig(value)
  })
  claimInterface = vi.fn(async (_n: number) => undefined)
  releaseInterface = vi.fn(async (_n: number) => undefined)
  clearHalt = vi.fn(async (_dir: USBDirection, _ep: number) => undefined)

  // transferIn is gated so the test controls when an IN read resolves. By default
  // it parks forever (a real bulk IN blocks until data or timeout) so the pump
  // loop doesn't busy-spin during the test.
  private _inResolvers: ((r: USBInTransferResult) => void)[] = []
  transferIn = vi.fn(
    (_ep: number, _len: number, _timeoutMs?: number): Promise<USBInTransferResult> =>
      new Promise<USBInTransferResult>((resolve, reject) => {
        this._inResolvers.push(resolve)
        this._inRejecters.push(reject)
      })
  )

  transferOut = vi.fn(
    async (_ep: number, data: BufferSource): Promise<USBOutTransferResult> =>
      ({ status: 'ok', bytesWritten: (data as ArrayBufferView).byteLength }) as USBOutTransferResult
  )

  private _inRejecters: ((e: unknown) => void)[] = []

  /** Resolve the oldest pending transferIn with the given bytes (or empty/no-data). */
  resolveIn(data?: Buffer, status: 'ok' | 'stall' = 'ok'): void {
    const resolve = this._inResolvers.shift()
    this._inRejecters.shift()
    if (!resolve) return
    resolve({
      status,
      data: data ? new DataView(data.buffer, data.byteOffset, data.byteLength) : undefined
    } as USBInTransferResult)
  }

  /** Reject the oldest pending transferIn. */
  rejectIn(err: unknown): void {
    const reject = this._inRejecters.shift()
    this._inResolvers.shift()
    if (!reject) return
    reject(err)
  }

  constructor(withEndpoints = true) {
    this.configuration = withEndpoints ? makeConfig(1) : makeConfig(1, false)
  }
}

function makeConfig(configurationValue: number, withBulk = true): USBConfiguration {
  const endpoints = withBulk
    ? [
        { endpointNumber: 1, direction: 'in', type: 'bulk', packetSize: 512 },
        { endpointNumber: 2, direction: 'out', type: 'bulk', packetSize: 512 }
      ]
    : []
  return {
    configurationValue,
    configurationName: undefined,
    interfaces: [
      {
        interfaceNumber: 0,
        claimed: false,
        alternate: { alternateSetting: 0, endpoints },
        alternates: []
      }
    ]
  } as unknown as USBConfiguration
}

// ── net mock ───────────────────────────────────────────────────────────────────

class MockServer extends EventEmitter {
  listen = vi.fn((_port: number, _addr: string, cb: () => void) => cb())
  close = vi.fn((cb?: () => void) => cb?.())
}

class MockLoopbackSocket extends EventEmitter {
  setNoDelay = vi.fn()
  write = vi.fn(() => true)
  destroy = vi.fn()
  destroyed = false
  writable = true
}

const createServer = vi.fn()
vi.mock('net', () => ({
  __esModule: true,
  createServer: (...a: unknown[]) => createServer(...a)
}))

// The bridge imports the `usb` singleton only for hotplug events during the
// non-accessory boot path (waitForAccessoryAttach). Our tests always start from
// accessory mode, so addEventListener/removeEventListener are never exercised —
// stub them so the import resolves.
vi.mock('usb', () => ({
  __esModule: true,
  usb: {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }
}))

const runAoapHandshakeMock = vi.fn(async () => undefined)
const isAccessoryModeMock = vi.fn(() => true)
vi.mock('../../aoap/handshake', () => ({
  isAccessoryMode: (...a: unknown[]) => isAccessoryModeMock(...a),
  runAoapHandshake: (...a: unknown[]) => runAoapHandshakeMock(...a)
}))

import { usb } from 'usb'
import type { Mock } from 'vitest'
import { UsbAoapBridge } from '../UsbAoapBridge'

type Device = USBDevice

beforeEach(async () => {
  createServer.mockReset()
  runAoapHandshakeMock.mockReset()
  isAccessoryModeMock.mockReturnValue(true)
  vi.spyOn(console, 'log').mockImplementation(function () {})
  vi.spyOn(console, 'warn').mockImplementation(function () {})
  vi.spyOn(console, 'error').mockImplementation(function () {})
})
afterEach(async () => vi.restoreAllMocks())

/** Wires createServer so the test can grab the connection handler. */
function newBridge(dev: MockDevice = new MockDevice()): {
  dev: MockDevice
  srv: MockServer
  connect: () => (s: MockLoopbackSocket) => void
} {
  const srv = new MockServer()
  let connHandler: ((s: MockLoopbackSocket) => void) | null = null
  createServer.mockImplementationOnce((_opts: unknown, h: (s: unknown) => void) => {
    connHandler = h as (s: MockLoopbackSocket) => void
    return srv
  })
  return { dev, srv, connect: () => connHandler! }
}

const flush = (): Promise<void> => new Promise((r) => setImmediate(r))

describe('UsbAoapBridge — start', () => {
  test('refuses double-start', async () => {
    const dev = new MockDevice()
    createServer.mockImplementationOnce(() => new MockServer())
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    createServer.mockClear()
    await bridge.start()
    expect(createServer).not.toHaveBeenCalled()
  })

  test('opens the accessory device, selects config, claims iface, emits ready', async () => {
    const dev = new MockDevice()
    createServer.mockImplementationOnce(() => new MockServer())
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    const ready = vi.fn()
    bridge.on('ready', ready)
    await bridge.start(5278)
    expect(dev.open).toHaveBeenCalled()
    expect(dev.claimInterface).toHaveBeenCalledWith(0)
    expect(ready).toHaveBeenCalledWith(
      expect.objectContaining({ host: expect.any(String), port: 5278 })
    )
  })

  test('open failure surfaces as a thrown error and resets running flag', async () => {
    isAccessoryModeMock.mockReturnValue(true)
    const dev = new MockDevice()
    dev.open.mockRejectedValue(new Error('not found'))
    const onError = vi.fn()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    bridge.on('error', onError)
    await expect(bridge.start()).rejects.toThrow(/Failed to open AOAP accessory/)
    expect(onError).toHaveBeenCalled()
  })

  test('throws when bulk IN/OUT endpoints are missing', async () => {
    const dev = new MockDevice(false) // no bulk endpoints
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    bridge.on('error', () => {}) // swallow the emitted error
    await expect(bridge.start()).rejects.toThrow(/bulk IN\/OUT/)
  })
})

describe('UsbAoapBridge — stop', () => {
  test('idempotent when never started', async () => {
    const dev = new MockDevice()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await expect(bridge.stop()).resolves.toBeUndefined()
  })

  test('after a successful start, stop releases, resets, closes and emits "closed"', async () => {
    const dev = new MockDevice()
    createServer.mockImplementationOnce(() => new MockServer())
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()

    const closed = vi.fn()
    bridge.on('closed', closed)
    await bridge.stop()
    expect(dev.releaseInterface).toHaveBeenCalledWith(0)
    expect(dev.reset).toHaveBeenCalled()
    expect(dev.close).toHaveBeenCalled()
    expect(closed).toHaveBeenCalled()
  })
})

describe('UsbAoapBridge — drain', () => {
  test('no-op before start', async () => {
    const dev = new MockDevice()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await expect(bridge.drain(10)).resolves.toBeUndefined()
  })

  test('resolves within the timeout when outChain is idle', async () => {
    const dev = new MockDevice()
    createServer.mockImplementationOnce(() => new MockServer())
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    const t0 = Date.now()
    await bridge.drain(100)
    expect(Date.now() - t0).toBeLessThan(500)
  })
})

describe('UsbAoapBridge — forceReenum', () => {
  test('no-op when nothing has been started', async () => {
    const dev = new MockDevice()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await expect(bridge.forceReenum()).resolves.toBeUndefined()
  })

  test('after start, forceReenum tears down the loopback server', async () => {
    const { dev, srv } = newBridge()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    await bridge.forceReenum()
    expect(srv.close).toHaveBeenCalled()
  })
})

describe('UsbAoapBridge — loopback server + pump', () => {
  test('client connect → setNoDelay + IN pump starts', async () => {
    const { dev, connect } = newBridge()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    const sock = new MockLoopbackSocket()
    connect()(sock as never)
    expect(sock.setNoDelay).toHaveBeenCalledWith(true)
    // The pump issues a blocking transferIn on the bulk IN endpoint.
    expect(dev.transferIn).toHaveBeenCalledWith(1, expect.any(Number), expect.any(Number))
  })

  test('second client tears down the first', async () => {
    const { dev, connect } = newBridge()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    const a = new MockLoopbackSocket()
    connect()(a as never)
    const b = new MockLoopbackSocket()
    connect()(b as never)
    expect(a.destroy).toHaveBeenCalled()
  })

  test('USB IN → socket write', async () => {
    const { dev, connect } = newBridge()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    const sock = new MockLoopbackSocket()
    connect()(sock as never)
    // Resolve the pending bulk IN with a chunk; the pump writes it to the socket.
    dev.resolveIn(Buffer.from([1, 2, 3]))
    await flush()
    expect(sock.write).toHaveBeenCalledWith(Buffer.from([1, 2, 3]))
  })

  test('socket → USB OUT.transferOut', async () => {
    const { dev, connect } = newBridge()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    const sock = new MockLoopbackSocket()
    connect()(sock as never)
    sock.emit('data', Buffer.from([0xaa]))
    await flush()
    expect(dev.transferOut).toHaveBeenCalledWith(2, Buffer.from([0xaa]))
  })

  test('USB IN disconnect error → emit error + destroy socket', async () => {
    const { dev, connect } = newBridge()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    const onErr = vi.fn()
    bridge.on('error', onErr)
    await bridge.start()
    const sock = new MockLoopbackSocket()
    // First transferIn rejects with a fatal "no device" — pump tears the socket down.
    dev.transferIn.mockImplementationOnce(async () => {
      throw new Error('LIBUSB_ERROR_NO_DEVICE: device gone')
    })
    connect()(sock as never)
    await flush()
    expect(onErr).toHaveBeenCalled()
    expect(sock.destroy).toHaveBeenCalled()
  })

  test('socket close pauses the pump and clears _client', async () => {
    const { dev, connect } = newBridge()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    const sock = new MockLoopbackSocket()
    connect()(sock as never)
    sock.emit('close')
    expect((bridge as unknown as { _client: unknown })._client).toBeNull()
  })

  test('socket error is forwarded', async () => {
    const { dev, connect } = newBridge()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    const onErr = vi.fn()
    bridge.on('error', onErr)
    await bridge.start()
    const sock = new MockLoopbackSocket()
    connect()(sock as never)
    sock.emit('error', new Error('reset'))
    expect(onErr).toHaveBeenCalled()
  })
})

describe('UsbAoapBridge — accessory open retry', () => {
  test('first 4 opens reject, fifth succeeds', async () => {
    const dev = new MockDevice()
    let attempts = 0
    dev.open.mockImplementation(async () => {
      attempts++
      if (attempts < 5) throw new Error('udev not ready')
    })
    createServer.mockImplementationOnce(() => new MockServer())
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    expect(dev.open).toHaveBeenCalledTimes(5)
  })

  test('5 failed opens throw with the descriptive error', async () => {
    isAccessoryModeMock.mockReturnValue(true)
    const dev = new MockDevice()
    dev.open.mockRejectedValue(new Error('udev not ready'))
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    bridge.on('error', () => {})
    await expect(bridge.start()).rejects.toThrow(/Failed to open AOAP accessory/)
  })

  test('claim retry: first call rejects, second succeeds', async () => {
    const dev = new MockDevice()
    let attempts = 0
    dev.claimInterface.mockImplementation(async () => {
      attempts++
      if (attempts < 2) throw new Error('udev claim race')
    })
    createServer.mockImplementationOnce(() => new MockServer())
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    expect(dev.claimInterface).toHaveBeenCalledTimes(2)
  })

  test('5 failed claims throw a descriptive error', async () => {
    const dev = new MockDevice()
    dev.claimInterface.mockRejectedValue(new Error('busy'))
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    bridge.on('error', () => {})
    await expect(bridge.start()).rejects.toThrow(/Failed to claim AOAP accessory/)
  })
})

describe('UsbAoapBridge — pump edge cases', () => {
  test('USB IN with backpressure awaits drain before the next read', async () => {
    const { dev, connect } = newBridge()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    const sock = new MockLoopbackSocket()
    sock.write = vi.fn(() => false) // signal backpressure
    connect()(sock as never)

    dev.transferIn.mockClear()
    // Deliver a chunk; sock.write returns false so the pump parks on 'drain'.
    dev.resolveIn(Buffer.from([1]))
    await flush()
    expect(sock.write).toHaveBeenCalled()
    // No further read is issued while backpressured.
    expect(dev.transferIn).not.toHaveBeenCalled()

    // Releasing backpressure lets the pump issue its next read.
    sock.emit('drain')
    await flush()
    expect(dev.transferIn).toHaveBeenCalled()
  })

  test('IN stall clears the halt and keeps pumping', async () => {
    const { dev, connect } = newBridge()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    const sock = new MockLoopbackSocket()
    connect()(sock as never)

    dev.resolveIn(undefined, 'stall')
    await flush()
    expect(dev.clearHalt).toHaveBeenCalledWith('in', 1)
  })

  test('outChain transferOut error → emit error + destroy socket', async () => {
    const { dev, connect } = newBridge()
    dev.transferOut.mockRejectedValue(new Error('USB stall'))
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    const onErr = vi.fn()
    bridge.on('error', onErr)
    await bridge.start()
    const sock = new MockLoopbackSocket()
    connect()(sock as never)
    sock.emit('data', Buffer.from([0xaa]))
    await flush()
    expect(onErr).toHaveBeenCalled()
    expect(sock.destroy).toHaveBeenCalled()
  })
})

describe('UsbAoapBridge — non-accessory boot (mode switch + re-enumerate)', () => {
  const ACCESSORY_PID = 0x2d00

  // Fire the hotplug 'connect' that waitForAccessoryAttach is listening for, with an
  // accessory-mode device, so the parked `await reenumerated` resolves.
  async function fireAccessoryConnect(): Promise<void> {
    for (let i = 0; i < 50 && (usb.addEventListener as Mock).mock.calls.length === 0; i++) {
      await flush()
    }
    const onConnect = (usb.addEventListener as Mock).mock.calls.at(-1)![1] as (e: {
      device: unknown
    }) => void
    const acc = new MockDevice()
    acc.productId = ACCESSORY_PID
    onConnect({ device: acc })
  }

  test('opens the normal-mode device, runs the AOAP handshake, then opens the accessory', async () => {
    ;(usb.addEventListener as Mock).mockClear()
    isAccessoryModeMock.mockReturnValue(false)
    const dev = new MockDevice()
    createServer.mockImplementationOnce(() => new MockServer())
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    const ready = vi.fn()
    bridge.on('ready', ready)

    const startP = bridge.start()
    await fireAccessoryConnect()
    await startP

    expect(dev.open).toHaveBeenCalled()
    expect(runAoapHandshakeMock).toHaveBeenCalled()
    expect(dev.close).toHaveBeenCalled() // normal-mode device is closed after the handshake
    expect(ready).toHaveBeenCalled()
  })

  test('invokes the onWillReenumerate hook with a timeout budget', async () => {
    ;(usb.addEventListener as Mock).mockClear()
    isAccessoryModeMock.mockReturnValue(false)
    const dev = new MockDevice()
    const onWillReenumerate = vi.fn()
    createServer.mockImplementationOnce(() => new MockServer())
    const bridge = new UsbAoapBridge(dev as unknown as Device, onWillReenumerate)

    const startP = bridge.start()
    await fireAccessoryConnect()
    await startP

    expect(onWillReenumerate).toHaveBeenCalledWith(expect.any(Number))
  })

  test('rejects when the accessory never re-enumerates before the timeout', async () => {
    vi.useFakeTimers()
    ;(usb.addEventListener as Mock).mockClear()
    isAccessoryModeMock.mockReturnValue(false)
    const dev = new MockDevice()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    bridge.on('error', () => {})
    const p = bridge.start()
    const assertion = expect(p).rejects.toThrow(/re-enumerate timeout/)
    await vi.advanceTimersByTimeAsync(60_000)
    await assertion
    vi.useRealTimers()
  })
})

describe('UsbAoapBridge — additional coverage', () => {
  test('drain bails out if stopped during the initial yield', async () => {
    const dev = new MockDevice()
    createServer.mockImplementationOnce(() => new MockServer())
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    const p = bridge.drain(100)
    ;(bridge as unknown as { _running: boolean })._running = false
    await expect(p).resolves.toBeUndefined()
  })

  test('stop tolerates release/reset/close rejections', async () => {
    const dev = new MockDevice()
    dev.releaseInterface.mockRejectedValue(new Error('rel'))
    dev.reset.mockRejectedValue(new Error('rst'))
    dev.close.mockRejectedValue(new Error('cls'))
    createServer.mockImplementationOnce(() => new MockServer())
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    await expect(bridge.stop()).resolves.toBeUndefined()
  })

  test('loopback server error after listen is forwarded', async () => {
    const { dev, srv } = newBridge()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    const onErr = vi.fn()
    bridge.on('error', onErr)
    await bridge.start()
    srv.emit('error', new Error('EPIPE'))
    expect(onErr).toHaveBeenCalled()
  })

  test('start rejects when the loopback server fails to listen', async () => {
    const dev = new MockDevice()
    const failSrv = new MockServer()
    failSrv.listen = vi.fn((_p: number, _a: string, _cb: () => void) => {
      failSrv.emit('error', new Error('EACCES'))
    })
    createServer.mockImplementationOnce(() => failSrv)
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    bridge.on('error', () => {})
    await expect(bridge.start()).rejects.toThrow('EACCES')
  })

  test('pump aborts when endpoints are not initialised', async () => {
    const { dev, connect } = newBridge()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    ;(bridge as unknown as { _inEpNum: number | null })._inEpNum = null
    const sock = new MockLoopbackSocket()
    connect()(sock as never)
    expect(sock.destroy).toHaveBeenCalledWith(expect.any(Error))
  })

  test('a stale socket does not pump OUT or handle close', async () => {
    const { dev, connect } = newBridge()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    const a = new MockLoopbackSocket()
    connect()(a as never)
    const b = new MockLoopbackSocket()
    connect()(b as never)
    dev.transferOut.mockClear()
    a.emit('data', Buffer.from([1]))
    await flush()
    expect(dev.transferOut).not.toHaveBeenCalled()
    a.emit('close')
    expect((bridge as unknown as { _client: unknown })._client).toBe(b)
  })

  test('data after socket close is ignored', async () => {
    const { dev, connect } = newBridge()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    const sock = new MockLoopbackSocket()
    connect()(sock as never)
    sock.emit('close')
    dev.transferOut.mockClear()
    sock.emit('data', Buffer.from([1]))
    await flush()
    expect(dev.transferOut).not.toHaveBeenCalled()
  })

  test('IN read that resolves ok but empty is skipped', async () => {
    const { dev, connect } = newBridge()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    const sock = new MockLoopbackSocket()
    connect()(sock as never)
    dev.resolveIn(undefined, 'ok')
    await flush()
    expect(sock.write).not.toHaveBeenCalled()
  })

  test('IN read is dropped when the socket is already destroyed', async () => {
    const { dev, connect } = newBridge()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    const sock = new MockLoopbackSocket()
    connect()(sock as never)
    sock.destroyed = true
    dev.resolveIn(Buffer.from([1, 2]))
    await flush()
    expect(sock.write).not.toHaveBeenCalled()
  })

  test('IN read arriving after the pump stopped is dropped', async () => {
    const { dev, connect } = newBridge()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    const sock = new MockLoopbackSocket()
    connect()(sock as never)
    ;(bridge as unknown as { _pumping: boolean })._pumping = false
    dev.resolveIn(Buffer.from([1, 2]))
    await flush()
    expect(sock.write).not.toHaveBeenCalled()
  })

  test('IN error after the pump stopped is swallowed silently', async () => {
    const { dev, connect } = newBridge()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    const onErr = vi.fn()
    bridge.on('error', onErr)
    await bridge.start()
    const sock = new MockLoopbackSocket()
    connect()(sock as never)
    ;(bridge as unknown as { _pumping: boolean })._pumping = false
    dev.rejectIn(new Error('device gone'))
    await flush()
    expect(onErr).not.toHaveBeenCalled()
  })

  test('a non-fatal, non-Error IN failure is stringified and retried', async () => {
    const { dev, connect } = newBridge()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    const onErr = vi.fn()
    bridge.on('error', onErr)
    await bridge.start()
    const sock = new MockLoopbackSocket()
    connect()(sock as never)
    dev.transferIn.mockClear()
    dev.rejectIn('transient glitch')
    await flush()
    expect(onErr).not.toHaveBeenCalled()
    expect(dev.transferIn).toHaveBeenCalled()
  })

  test('exposes the underlying device via the getter', () => {
    const dev = new MockDevice()
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    expect(bridge.device).toBe(dev as unknown as Device)
  })

  test('selectConfiguration is invoked and its failure is tolerated', async () => {
    const dev = new MockDevice()
    dev.configuration = makeConfig(2)
    dev.selectConfiguration.mockRejectedValue(new Error('sel fail'))
    createServer.mockImplementationOnce(() => new MockServer())
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    expect(dev.selectConfiguration).toHaveBeenCalledWith(1)
  })

  test('missing configuration surfaces as an endpoints-not-found error', async () => {
    const dev = new MockDevice()
    dev.configuration = undefined
    dev.selectConfiguration = vi.fn(async () => undefined)
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    bridge.on('error', () => {})
    await expect(bridge.start()).rejects.toThrow(/bulk IN\/OUT/)
  })

  test('non-bulk and directionless endpoints are skipped when scanning', async () => {
    const dev = new MockDevice()
    dev.configuration = {
      configurationValue: 1,
      configurationName: undefined,
      interfaces: [
        {
          interfaceNumber: 0,
          claimed: false,
          alternate: {
            alternateSetting: 0,
            endpoints: [
              { endpointNumber: 5, direction: 'in', type: 'interrupt' },
              { endpointNumber: 6, direction: 'inout', type: 'bulk' },
              { endpointNumber: 1, direction: 'in', type: 'bulk' },
              { endpointNumber: 2, direction: 'out', type: 'bulk' }
            ]
          },
          alternates: []
        }
      ]
    } as unknown as USBConfiguration
    createServer.mockImplementationOnce(() => new MockServer())
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    expect(dev.claimInterface).toHaveBeenCalledWith(0)
  })

  test('open retry failure with a non-Error reason reports "unknown"', async () => {
    const dev = new MockDevice()
    dev.open.mockRejectedValue(undefined)
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    bridge.on('error', () => {})
    await expect(bridge.start()).rejects.toThrow(/unknown/)
  })

  test('claim retry failure with a non-Error reason reports "unknown"', async () => {
    const dev = new MockDevice()
    dev.claimInterface.mockRejectedValue(undefined)
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    bridge.on('error', () => {})
    await expect(bridge.start()).rejects.toThrow(/unknown/)
  })

  test('stop with no accessory device still emits closed', async () => {
    const dev = new MockDevice()
    createServer.mockImplementationOnce(() => new MockServer())
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    ;(bridge as unknown as { _accessoryDevice: unknown })._accessoryDevice = null
    const closed = vi.fn()
    bridge.on('closed', closed)
    await bridge.stop()
    expect(closed).toHaveBeenCalled()
    expect(dev.releaseInterface).not.toHaveBeenCalled()
  })

  test('stop skips releaseInterface when no interface is held', async () => {
    const dev = new MockDevice()
    createServer.mockImplementationOnce(() => new MockServer())
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    await bridge.start()
    ;(bridge as unknown as { _ifaceNum: number | null })._ifaceNum = null
    await bridge.stop()
    expect(dev.releaseInterface).not.toHaveBeenCalled()
    expect(dev.reset).toHaveBeenCalled()
  })
})

describe('UsbAoapBridge — re-enumerate hotplug filter', () => {
  test('ignores a connect event from a non-accessory device', async () => {
    ;(usb.addEventListener as Mock).mockClear()
    isAccessoryModeMock.mockReturnValue(false)
    const dev = new MockDevice()
    createServer.mockImplementationOnce(() => new MockServer())
    const bridge = new UsbAoapBridge(dev as unknown as Device)
    const startP = bridge.start()

    for (let i = 0; i < 50 && (usb.addEventListener as Mock).mock.calls.length === 0; i++) {
      await flush()
    }
    const onConnect = (usb.addEventListener as Mock).mock.calls.at(-1)![1] as (e: {
      device: unknown
    }) => void
    const stranger = new MockDevice()
    stranger.vendorId = 0x1234
    stranger.productId = 0x9999
    onConnect({ device: stranger })

    const acc = new MockDevice()
    acc.productId = 0x2d00
    onConnect({ device: acc })
    await startP
    expect(dev.close).toHaveBeenCalled()
  })
})
