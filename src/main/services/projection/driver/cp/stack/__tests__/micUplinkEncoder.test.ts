import { spawn } from 'node:child_process'
import dgram from 'node:dgram'
import { EventEmitter } from 'node:events'
import { gstEnv, resolveGStreamerRoot } from '@main/services/audio/gstreamer'
import { type CpMicEncoderOpts, CpMicUplinkEncoder } from '../micUplinkEncoder'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

vi.mock('@main/services/audio/gstreamer', () => ({
  resolveGStreamerRoot: vi.fn(() => '/gst'),
  gstEnv: vi.fn(() => ({ GST_PLUGIN_PATH: '/gst/lib' }))
}))

type FakeProc = EventEmitter & {
  stdout: EventEmitter
  stderr: EventEmitter
  stdin: { write: ReturnType<typeof vi.fn> }
  kill: ReturnType<typeof vi.fn>
}

function fakeProc(): FakeProc {
  const proc = new EventEmitter() as FakeProc
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.stdin = { write: vi.fn() }
  proc.kill = vi.fn()
  return proc
}

type FakeUdp = EventEmitter & {
  bind: ReturnType<typeof vi.fn>
  address: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
}

function fakeUdp(port: { port: number } | null): FakeUdp {
  const sock = new EventEmitter() as FakeUdp
  sock.bind = vi.fn((_port: number, _host: string, cb?: () => void) => cb?.())
  sock.address = vi.fn(() => port)
  sock.close = vi.fn((cb?: () => void) => cb?.())
  sock.send = vi.fn()
  return sock
}

function opts(overrides: Partial<CpMicEncoderOpts> = {}): CpMicEncoderOpts {
  return { sampleRate: 24000, channels: 1, bitrate: 48000, frameMs: 20, label: 'mic', ...overrides }
}

const spawnMock = vi.mocked(spawn)
const rootMock = vi.mocked(resolveGStreamerRoot)

let proc: FakeProc
let probe: FakeUdp
let sock: FakeUdp
let createSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  rootMock.mockReturnValue('/gst')
  proc = fakeProc()
  spawnMock.mockReturnValue(proc as never)
  probe = fakeUdp({ port: 40123 })
  sock = fakeUdp({ port: 40123 })
  const queue = [probe, sock]
  createSpy = vi
    .spyOn(dgram, 'createSocket')
    .mockImplementation(() => (queue.shift() ?? fakeUdp(null)) as unknown as dgram.Socket)
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  createSpy.mockRestore()
  warnSpy.mockRestore()
  errorSpy.mockRestore()
})

describe('CpMicUplinkEncoder start', () => {
  test('fails without a bundled gstreamer', async () => {
    rootMock.mockReturnValue(null)
    await expect(new CpMicUplinkEncoder(opts()).start()).resolves.toBe(false)
    expect(errorSpy).toHaveBeenCalledWith('[cpMicEnc:mic] bundled GStreamer not found')
    expect(spawnMock).not.toHaveBeenCalled()
  })

  test('spawns the opus pipeline on a probed free port and binds the receiver', async () => {
    const enc = new CpMicUplinkEncoder(opts())
    await expect(enc.start()).resolves.toBe(true)
    const [cmd, args, options] = spawnMock.mock.calls[0] as unknown as [
      string,
      string[],
      { env: Record<string, string>; shell: boolean }
    ]
    expect(cmd).toBe('/gst/bin/gst-launch-1.0')
    expect(args).toContain('sample-rate=24000')
    expect(args).toContain('num-channels=1')
    expect(args).toContain('bitrate=48000')
    expect(args).toContain('frame-size=20')
    expect(args).toContain('port=40123')
    expect(options.env).toEqual({ GST_PLUGIN_PATH: '/gst/lib' })
    expect(options.shell).toBe(false)
    expect(gstEnv).toHaveBeenCalledWith('/gst')
    expect(sock.bind).toHaveBeenCalledWith(40123, '127.0.0.1', expect.any(Function))
  })

  test('rejects when the port probe errors', async () => {
    probe.bind = vi.fn(() => probe.emit('error', new Error('EPERM')))
    await expect(new CpMicUplinkEncoder(opts()).start()).rejects.toThrow('EPERM')
  })

  test('falls back to port 0 when the probe reports no address', async () => {
    probe.address = vi.fn(() => null)
    const enc = new CpMicUplinkEncoder(opts())
    await expect(enc.start()).resolves.toBe(true)
    expect(sock.bind).toHaveBeenCalledWith(0, '127.0.0.1', expect.any(Function))
  })
})

describe('CpMicUplinkEncoder frames', () => {
  test('strips the rtp header off received packets and drops runts', async () => {
    const enc = new CpMicUplinkEncoder(opts())
    await enc.start()
    const frames: Buffer[] = []
    enc.on('opus', (f: Buffer) => frames.push(f))
    sock.emit('message', Buffer.concat([Buffer.alloc(12), Buffer.from('opus-frame')]))
    sock.emit('message', Buffer.alloc(12))
    expect(frames).toEqual([Buffer.from('opus-frame')])
    expect(() => sock.emit('error', new Error('drop'))).not.toThrow()
  })

  test('write feeds pcm to the pipeline stdin and is a no-op before start', async () => {
    const enc = new CpMicUplinkEncoder(opts())
    expect(() => enc.write(Buffer.from('early'))).not.toThrow()
    await enc.start()
    enc.write(Buffer.from('pcm'))
    expect(proc.stdin.write).toHaveBeenCalledWith(Buffer.from('pcm'))
  })

  test('surfaces only suspicious stderr lines', async () => {
    const enc = new CpMicUplinkEncoder(opts())
    await enc.start()
    proc.stderr.emit('data', Buffer.from('Setting pipeline to PLAYING\nERROR: no element\n'))
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith('[cpMicEnc:mic] ERROR: no element')
  })
})

describe('CpMicUplinkEncoder lifecycle', () => {
  test('a spawn error warns and clears the current process', async () => {
    const enc = new CpMicUplinkEncoder(opts())
    await enc.start()
    proc.emit('error', new Error('ENOENT'))
    expect(warnSpy).toHaveBeenCalledWith('[cpMicEnc:mic] spawn error: ENOENT')
    enc.write(Buffer.from('pcm'))
    expect(proc.stdin.write).not.toHaveBeenCalled()
  })

  test('process exit clears the current process only', async () => {
    const enc = new CpMicUplinkEncoder(opts())
    await enc.start()
    proc.emit('close')
    enc.write(Buffer.from('pcm'))
    expect(proc.stdin.write).not.toHaveBeenCalled()
  })

  test('late error and close events from a replaced process are ignored', async () => {
    const enc = new CpMicUplinkEncoder(opts())
    await enc.start()
    enc.stop()
    const second = fakeProc()
    spawnMock.mockReturnValue(second as never)
    await enc.start()
    proc.emit('error', new Error('late'))
    proc.emit('close')
    enc.write(Buffer.from('pcm'))
    expect(second.stdin.write).toHaveBeenCalledWith(Buffer.from('pcm'))
    enc.stop()
  })

  test('stop kills the process, closes the socket and tolerates repeats', async () => {
    const enc = new CpMicUplinkEncoder(opts())
    await enc.start()
    enc.stop()
    expect(proc.kill).toHaveBeenCalled()
    expect(sock.close).toHaveBeenCalled()
    enc.stop()
    expect(proc.kill).toHaveBeenCalledTimes(1)
  })

  test('stop swallows kill errors', async () => {
    const enc = new CpMicUplinkEncoder(opts())
    await enc.start()
    proc.kill = vi.fn(() => {
      throw new Error('ESRCH')
    })
    expect(() => enc.stop()).not.toThrow()
  })
})
