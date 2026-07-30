import { EventEmitter } from 'node:events'
import Module from 'node:module'

const { spawnMock, execFileSyncMock, children } = vi.hoisted(() => {
  const events = require('node:events')
  const children: Array<
    InstanceType<typeof events.EventEmitter> & { kill: ReturnType<typeof vi.fn> }
  > = []
  const spawnMock = vi.fn(() => {
    const c = new events.EventEmitter()
    c.kill = vi.fn()
    children.push(c)
    return c
  })
  const execFileSyncMock = vi.fn()
  return { spawnMock, execFileSyncMock, children }
})
vi.mock('node:child_process', () => ({ spawn: spawnMock, execFileSync: execFileSyncMock }))

const { createServerMock, servers, connectionHandlers, listenControl } = vi.hoisted(() => {
  const events = require('node:events')
  const servers: Array<InstanceType<typeof events.EventEmitter>> = []
  const connectionHandlers: Array<(s: unknown) => void> = []
  const listenControl: { defer: boolean; cbs: Array<() => void> } = { defer: false, cbs: [] }
  const createServerMock = vi.fn((handler: (s: unknown) => void) => {
    connectionHandlers.push(handler)
    const server = new events.EventEmitter()
    server.listen = vi.fn((_path: string, cb?: () => void) => {
      if (listenControl.defer) {
        if (cb) listenControl.cbs.push(cb)
      } else {
        cb?.()
      }
      return server
    })
    server.close = vi.fn()
    servers.push(server)
    return server
  })
  return { createServerMock, servers, connectionHandlers, listenControl }
})
vi.mock('node:net', () => ({
  default: { createServer: createServerMock },
  createServer: createServerMock
}))

const { fs } = vi.hoisted(() => ({
  fs: {
    chmodSync: vi.fn(),
    unlinkSync: vi.fn(),
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '')
  }
}))
vi.mock('node:fs', () => fs)

vi.mock('node:os', () => ({ default: { tmpdir: () => '/tmp' }, tmpdir: () => '/tmp' }))

const { appOn } = vi.hoisted(() => ({ appOn: vi.fn() }))
vi.mock('electron', () => ({ app: { on: appOn } }))

const { resolveRootMock, gstEnvMock } = vi.hoisted(() => ({
  resolveRootMock: vi.fn((): string | null => '/opt/gst'),
  gstEnvMock: vi.fn((root: string) => ({
    GST_PLUGIN_SYSTEM_PATH: '',
    GST_PLUGIN_PATH: `${root}/lib/gstreamer-1.0`,
    LD_LIBRARY_PATH: `${root}/lib`
  }))
}))
vi.mock('../../audio/gstreamer', () => ({
  resolveGStreamerRoot: resolveRootMock,
  gstEnv: gstEnvMock
}))

type GstHostModule = typeof import('../gstHost')

async function freshModule(): Promise<GstHostModule> {
  vi.resetModules()
  return import('../gstHost')
}

async function freshHost(): Promise<GstHostModule['gstHost']> {
  return (await freshModule()).gstHost
}

function makeSocket() {
  const s = new EventEmitter() as EventEmitter & {
    writable: boolean
    write: ReturnType<typeof vi.fn>
  }
  s.writable = true
  s.write = vi.fn()
  return s
}

function reverse(rop: number, id: number, rest: Buffer = Buffer.alloc(0)): Buffer {
  const head = Buffer.allocUnsafe(9)
  head.writeUInt32LE(5 + rest.length, 0)
  head.writeUInt8(rop, 4)
  head.writeUInt32LE(id, 5)
  return Buffer.concat([head, rest])
}

type Resolver = { _resolveFilename: (...args: unknown[]) => unknown }

function blockGstVideoResolve(): () => void {
  const M = Module as unknown as Resolver
  const orig = M._resolveFilename
  M._resolveFilename = function (request: unknown, ...rest: unknown[]) {
    if (request === 'gst-video') throw new Error('module not found')
    return orig.call(this, request, ...rest)
  }
  return () => {
    M._resolveFilename = orig
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  children.length = 0
  servers.length = 0
  connectionHandlers.length = 0
  listenControl.defer = false
  listenControl.cbs = []
  fs.existsSync.mockReturnValue(false)
  fs.readFileSync.mockReturnValue('')
  delete process.env.APPIMAGE
  delete process.env.LIVI_GST_PRELOAD
})

afterEach(() => {
  vi.useRealTimers()
})

describe('gstHost framing + transport', () => {
  test('starts the host and queues a create frame until the socket connects', async () => {
    const gstHost = await freshHost()
    gstHost.createPlayer(7, 'h264')

    expect(createServerMock).toHaveBeenCalledTimes(1)
    expect(spawnMock).toHaveBeenCalledTimes(1)

    const sock = makeSocket()
    connectionHandlers[0](sock)

    expect(sock.write).toHaveBeenCalledTimes(1)
    const f = sock.write.mock.calls[0][0] as Buffer
    expect(f.readUInt32LE(0)).toBe(5 + 1 + 'h264'.length)
    expect(f.readUInt8(4)).toBe(1)
    expect(f.readUInt32LE(5)).toBe(7)
    expect(f.readUInt8(9)).toBe('h264'.length)
    expect(f.subarray(10).toString('utf8')).toBe('h264')
  })

  test('create appends codec_data when present and skips an empty record', async () => {
    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h265', Buffer.from([0xde, 0xad]))
    gstHost.createPlayer(2, 'h264', Buffer.alloc(0))

    const sock = makeSocket()
    connectionHandlers[0](sock)

    const first = sock.write.mock.calls[0][0] as Buffer
    expect(first.subarray(10, 14).toString('utf8')).toBe('h265')
    expect(first.subarray(14)).toEqual(Buffer.from([0xde, 0xad]))
    const second = sock.write.mock.calls[1][0] as Buffer
    expect(second.readUInt32LE(0)).toBe(5 + 1 + 'h264'.length)
  })

  test('writes directly once the socket is live', async () => {
    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h264')
    const sock = makeSocket()
    connectionHandlers[0](sock)
    sock.write.mockClear()

    gstHost.pushBuffer(1, Buffer.from([0xaa, 0xbb]))

    expect(sock.write).toHaveBeenCalledTimes(1)
    const f = sock.write.mock.calls[0][0] as Buffer
    expect(f.readUInt8(4)).toBe(2)
    expect(f.readUInt32LE(5)).toBe(1)
    expect(f.subarray(9)).toEqual(Buffer.from([0xaa, 0xbb]))
  })

  test('stop sends an empty-payload frame', async () => {
    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h264')
    const sock = makeSocket()
    connectionHandlers[0](sock)
    sock.write.mockClear()

    gstHost.stop(3)

    const f = sock.write.mock.calls[0][0] as Buffer
    expect(f.readUInt32LE(0)).toBe(5)
    expect(f.readUInt8(4)).toBe(3)
    expect(f.readUInt32LE(5)).toBe(3)
    expect(f).toHaveLength(9)
  })

  test('setGamma sends five little-endian doubles', async () => {
    const gstHost = await freshHost()
    gstHost.setGamma(4, 1.1, 0.9, 1, 2, 3)
    const sock = makeSocket()
    connectionHandlers[0](sock)

    const f = sock.write.mock.calls[0][0] as Buffer
    expect(f.readUInt8(4)).toBe(4)
    expect(f.readUInt32LE(5)).toBe(4)
    expect(f.readDoubleLE(9)).toBeCloseTo(1.1)
    expect(f.readDoubleLE(17)).toBeCloseTo(0.9)
    expect(f.readDoubleLE(25)).toBe(1)
    expect(f.readDoubleLE(33)).toBe(2)
    expect(f.readDoubleLE(41)).toBe(3)
  })

  test('setActiveFeeder and closeVideoReceiver send their control frames', async () => {
    const gstHost = await freshHost()
    gstHost.setActiveFeeder(2, true)
    gstHost.setActiveFeeder(2, false)
    gstHost.closeVideoReceiver(2)
    const sock = makeSocket()
    connectionHandlers[0](sock)

    const frames = sock.write.mock.calls.map((c) => c[0] as Buffer)
    expect(frames[0].readUInt8(4)).toBe(7)
    expect(frames[0].readUInt8(9)).toBe(1)
    expect(frames[1].readUInt8(9)).toBe(0)
    expect(frames[2].readUInt8(4)).toBe(6)
    expect(frames[2]).toHaveLength(9)
  })

  test('flushes all queued frames in order on connect', async () => {
    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h264')
    gstHost.pushBuffer(1, Buffer.from([0x01]))
    gstHost.stop(1)

    const sock = makeSocket()
    connectionHandlers[0](sock)

    expect(sock.write).toHaveBeenCalledTimes(3)
    const ops = sock.write.mock.calls.map((c) => (c[0] as Buffer).readUInt8(4))
    expect(ops).toEqual([1, 2, 3])
  })

  test('start is idempotent — the host is spawned once', async () => {
    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h264')
    gstHost.createPlayer(2, 'h264')

    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(createServerMock).toHaveBeenCalledTimes(1)
  })

  test('a second send while the server is still binding does not start twice', async () => {
    listenControl.defer = true
    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h264')
    gstHost.createPlayer(2, 'h264')

    expect(createServerMock).toHaveBeenCalledTimes(1)
    expect(spawnMock).not.toHaveBeenCalled()

    listenControl.cbs[0]()
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })

  test('spawns the host on the bundled GStreamer', async () => {
    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h264')

    const env = spawnMock.mock.calls[0]![2].env
    expect(env.LD_LIBRARY_PATH).toBe('/opt/gst/lib')
    expect(env.GST_PLUGIN_PATH).toBe('/opt/gst/lib/gstreamer-1.0')
    expect(env.GST_PLUGIN_SYSTEM_PATH).toBe('')
    expect(env.GST_GL_WINDOW).toBe('surfaceless')
    expect(env.GST_GL_PLATFORM).toBe('egl')
  })

  test('spawns with the plain environment when no bundle is present', async () => {
    resolveRootMock.mockReturnValueOnce(null)
    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h264')

    const env = spawnMock.mock.calls[0]![2].env
    expect(env.LD_LIBRARY_PATH).toBeUndefined()
    expect(env.GST_GL_WINDOW).toBe('surfaceless')
  })

  test('LIVI_GST_PRELOAD is passed to the child as LD_PRELOAD', async () => {
    process.env.LIVI_GST_PRELOAD = '/lib/override.so'
    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h264')

    const env = spawnMock.mock.calls[0]![2].env
    expect(env.LD_PRELOAD).toBe('/lib/override.so')
  })

  test('the crash log lands next to the AppImage when packaged', async () => {
    process.env.APPIMAGE = '/deploy/livi.AppImage'
    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h264')

    expect(spawnMock.mock.calls[0]![1][1]).toBe('/deploy/livi-gst-host-crash.log')
  })

  test('fs cleanup failures during start are ignored', async () => {
    fs.unlinkSync
      .mockImplementationOnce(() => {
        throw new Error('busy')
      })
      .mockImplementationOnce(() => {
        throw new Error('busy')
      })
    fs.chmodSync.mockImplementationOnce(() => {
      throw new Error('ro')
    })
    const gstHost = await freshHost()
    expect(() => gstHost.createPlayer(1, 'h264')).not.toThrow()
    expect(spawnMock).toHaveBeenCalledTimes(1)
  })

  test('an unresolvable gst-video addon aborts the start with an error', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const restore = blockGstVideoResolve()
    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h264')

    expect(createServerMock).not.toHaveBeenCalled()
    expect(spawnMock).not.toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalledWith('[gstHost] cannot resolve gst-video:', 'module not found')

    restore()
    gstHost.createPlayer(1, 'h264')
    expect(spawnMock).toHaveBeenCalledTimes(1)
    errSpy.mockRestore()
  })

  test('a server error is logged', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h264')

    servers[0].emit('error', new Error('bind failed'))
    expect(errSpy).toHaveBeenCalledWith('[gstHost] server error:', 'bind failed')
    errSpy.mockRestore()
  })

  test('a socket error is swallowed', async () => {
    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h264')
    const sock = makeSocket()
    connectionHandlers[0](sock)

    expect(() => sock.emit('error', new Error('x'))).not.toThrow()
  })

  test('an unwritable socket queues frames instead of writing', async () => {
    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h264')
    const sock = makeSocket()
    connectionHandlers[0](sock)
    sock.write.mockClear()
    sock.writable = false

    gstHost.stop(1)
    expect(sock.write).not.toHaveBeenCalled()
  })

  test('a socket close clears the active socket so later frames re-queue', async () => {
    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h264')
    const sock = makeSocket()
    connectionHandlers[0](sock)
    sock.write.mockClear()

    sock.emit('close')
    gstHost.pushBuffer(1, Buffer.from([0x01]))

    expect(sock.write).not.toHaveBeenCalled()
  })

  test('closing a stale socket keeps the newer connection active', async () => {
    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h264')
    const sockA = makeSocket()
    connectionHandlers[0](sockA)
    const sockB = makeSocket()
    connectionHandlers[0](sockB)
    sockB.write.mockClear()

    sockA.emit('close')
    gstHost.stop(1)
    expect(sockB.write).toHaveBeenCalledTimes(1)
  })
})

describe('gstHost reverse channel', () => {
  test('openVideoReceiver sends an open frame and resolves with the reported port', async () => {
    const gstHost = await freshHost()
    const promise = gstHost.openVideoReceiver(0x7a000001, Buffer.from([9, 9]), true)
    const sock = makeSocket()
    connectionHandlers[0](sock)

    const f = sock.write.mock.calls[0][0] as Buffer
    expect(f.readUInt8(4)).toBe(5)
    const receiverId = f.readUInt32LE(5)
    expect(receiverId).toBe(0x7b000000)
    expect(f.readUInt32LE(9)).toBe(0x7a000001)
    expect(f.readUInt8(13)).toBe(1)
    expect(f.subarray(14)).toEqual(Buffer.from([9, 9]))

    const port = Buffer.allocUnsafe(2)
    port.writeUInt16LE(5004, 0)
    sock.emit('data', reverse(1, receiverId, port))
    await expect(promise).resolves.toEqual({ port: 5004, receiverId })
  })

  test('a short port payload resolves with port 0', async () => {
    const gstHost = await freshHost()
    const promise = gstHost.openVideoReceiver(1, Buffer.alloc(0))
    const sock = makeSocket()
    connectionHandlers[0](sock)
    const f = sock.write.mock.calls[0][0] as Buffer
    expect(f.readUInt8(13)).toBe(0)

    sock.emit('data', reverse(1, f.readUInt32LE(5), Buffer.from([7])))
    await expect(promise).resolves.toEqual({ port: 0, receiverId: f.readUInt32LE(5) })
  })

  test('an unanswered open times out with port 0', async () => {
    vi.useFakeTimers()
    const gstHost = await freshHost()
    const promise = gstHost.openVideoReceiver(1, Buffer.alloc(0))
    vi.advanceTimersByTime(4000)
    await expect(promise).resolves.toEqual({ port: 0, receiverId: 0x7b000000 })
  })

  test('a port frame without a waiter is ignored', async () => {
    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h264')
    const sock = makeSocket()
    connectionHandlers[0](sock)

    expect(() => sock.emit('data', reverse(1, 0x123, Buffer.from([1, 2])))).not.toThrow()
  })

  test('reverse config and started frames reach the registered callbacks', async () => {
    const gstHost = await freshHost()
    const stale = vi.fn()
    const cfg = vi.fn()
    const started = vi.fn()
    gstHost.onVideoReceiverConfig(stale)
    gstHost.onVideoReceiverConfig(cfg)
    gstHost.onVideoReceiverStarted(started)
    gstHost.createPlayer(1, 'h264')
    const sock = makeSocket()
    connectionHandlers[0](sock)

    sock.emit('data', reverse(2, 7, Buffer.from([1, 0xaa])))
    sock.emit('data', reverse(2, 8, Buffer.from([0, 0xbb])))
    sock.emit('data', reverse(2, 9))
    sock.emit('data', reverse(3, 7))
    sock.emit('data', reverse(9, 7))

    expect(stale).not.toHaveBeenCalled()
    expect(cfg).toHaveBeenNthCalledWith(1, 7, 'h265', Buffer.from([0xaa]))
    expect(cfg).toHaveBeenNthCalledWith(2, 8, 'h264', Buffer.from([0xbb]))
    expect(cfg).toHaveBeenNthCalledWith(3, 9, 'h264', Buffer.alloc(0))
    expect(started).toHaveBeenCalledTimes(1)
    expect(started).toHaveBeenCalledWith(7)
  })

  test('reassembles frames split across chunks and skips short frames', async () => {
    const gstHost = await freshHost()
    const started = vi.fn()
    gstHost.onVideoReceiverStarted(started)
    gstHost.createPlayer(1, 'h264')
    const sock = makeSocket()
    connectionHandlers[0](sock)

    const f = reverse(3, 5)
    sock.emit('data', f.subarray(0, 3))
    sock.emit('data', f.subarray(3, 6))
    sock.emit('data', f.subarray(6))
    expect(started).toHaveBeenCalledWith(5)

    const short = Buffer.from([1, 0, 0, 0, 0xff])
    sock.emit('data', Buffer.concat([short, reverse(3, 6)]))
    expect(started).toHaveBeenCalledWith(6)
    expect(started).toHaveBeenCalledTimes(2)
  })
})

describe('gstHost child lifecycle', () => {
  test('child exit on a signal prints the crash backtrace and closes the server', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fs.existsSync.mockReturnValue(true)
    fs.readFileSync.mockReturnValue('==== backtrace ====')

    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h264')

    children[0].emit('exit', null, 'SIGSEGV')

    expect(fs.readFileSync).toHaveBeenCalled()
    expect(servers[0].close).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  test('a signal exit without a crash log prints no backtrace', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h264')

    children[0].emit('exit', null, 'SIGKILL')

    expect(fs.readFileSync).not.toHaveBeenCalled()
    expect(servers[0].close).toHaveBeenCalled()
    errSpy.mockRestore()
  })

  test('a clean exit (no signal) does not read a crash log', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h264')

    children[0].emit('exit', 0, null)

    expect(fs.readFileSync).not.toHaveBeenCalled()
    errSpy.mockRestore()
  })

  test('respawns the host after the child exited', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h264')
    expect(spawnMock).toHaveBeenCalledTimes(1)

    children[0].emit('exit', 0, null)
    gstHost.createPlayer(2, 'h264')

    expect(spawnMock).toHaveBeenCalledTimes(2)
    expect(appOn).toHaveBeenCalledTimes(1)
    errSpy.mockRestore()
  })

  test('the before-quit hook kills the child', async () => {
    const gstHost = await freshHost()
    gstHost.createPlayer(1, 'h264')

    const hook = appOn.mock.calls.find((c) => c[0] === 'before-quit')?.[1] as () => void
    expect(hook).toBeTypeOf('function')
    hook()
    expect(children[0].kill).toHaveBeenCalled()
  })
})

describe('clusterPlaneId', () => {
  test('maps screens onto consecutive plane ids', async () => {
    const m = await freshModule()
    expect(m.clusterPlaneId('main')).toBe(0x7a000011)
    expect(m.clusterPlaneId('dash')).toBe(0x7a000012)
    expect(m.clusterPlaneId('aux')).toBe(0x7a000013)
  })
})

describe('probeCodecsViaHost', () => {
  test('runs the host with --probe on the bundled GStreamer and parses the JSON', async () => {
    execFileSyncMock.mockReturnValueOnce(
      '{"h264":{"hw":true,"sw":true},"h265":{"hw":false,"sw":true},"vp9":{"hw":false,"sw":false},"av1":{"hw":false,"sw":false}}\n'
    )
    const m = await freshModule()

    expect(m.probeCodecsViaHost()).toEqual({
      h264: { hw: true, sw: true },
      h265: { hw: false, sw: true },
      vp9: { hw: false, sw: false },
      av1: { hw: false, sw: false }
    })
    const [bin, args, opts] = execFileSyncMock.mock.calls[0]
    expect(bin).toMatch(/livi-gst-host$/)
    expect(args).toEqual(['--probe'])
    expect(opts.env.LD_LIBRARY_PATH).toBe('/opt/gst/lib')
    expect(opts.env.GST_GL_WINDOW).toBe('surfaceless')
    expect(opts.env.GST_GL_PLATFORM).toBe('egl')
  })

  test('probes with the plain environment when no bundle is present', async () => {
    resolveRootMock.mockReturnValueOnce(null)
    execFileSyncMock.mockReturnValueOnce('{"h264":{"hw":false,"sw":true}}')
    const m = await freshModule()

    expect(m.probeCodecsViaHost()).toEqual({ h264: { hw: false, sw: true } })
    const opts = execFileSyncMock.mock.calls[0][2]
    expect(opts.env.LD_LIBRARY_PATH).toBeUndefined()
  })

  test('a chmod failure does not stop the probe', async () => {
    fs.chmodSync.mockImplementationOnce(() => {
      throw new Error('ro')
    })
    execFileSyncMock.mockReturnValueOnce('{"h264":{"hw":false,"sw":true}}')
    const m = await freshModule()

    expect(m.probeCodecsViaHost()).toEqual({ h264: { hw: false, sw: true } })
  })

  test('returns null when the addon cannot be resolved', async () => {
    const restore = blockGstVideoResolve()
    const m = await freshModule()

    expect(m.probeCodecsViaHost()).toBeNull()
    expect(execFileSyncMock).not.toHaveBeenCalled()
    restore()
  })

  test('returns null and logs when the probe run fails', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    execFileSyncMock.mockImplementationOnce(() => {
      throw new Error('timeout')
    })
    const m = await freshModule()

    expect(m.probeCodecsViaHost()).toBeNull()
    expect(errSpy).toHaveBeenCalledWith('[gstHost] codec probe failed:', 'timeout')
    errSpy.mockRestore()
  })
})
