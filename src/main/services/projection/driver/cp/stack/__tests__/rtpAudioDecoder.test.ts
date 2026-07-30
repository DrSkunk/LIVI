import { spawn } from 'node:child_process'
import dgram from 'node:dgram'
import { EventEmitter } from 'node:events'
import { gstEnv, resolveGStreamerRoot } from '@main/services/audio/gstreamer'
import { CpRtpAudioDecoder, type CpRtpDecoderOpts } from '../rtpAudioDecoder'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))

vi.mock('@main/services/audio/gstreamer', () => ({
  resolveGStreamerRoot: vi.fn(() => '/gst'),
  gstEnv: vi.fn(() => ({ GST_PLUGIN_PATH: '/gst/lib' }))
}))

type FakeProc = EventEmitter & {
  stdout: EventEmitter
  stderr: EventEmitter
  kill: ReturnType<typeof vi.fn>
}

function fakeProc(): FakeProc {
  const proc = new EventEmitter() as FakeProc
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  proc.kill = vi.fn()
  return proc
}

type FakeUdp = EventEmitter & {
  bind: ReturnType<typeof vi.fn>
  address: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
}

function fakeUdp(): FakeUdp {
  const sock = new EventEmitter() as FakeUdp
  sock.bind = vi.fn((_port: number, _host: string, cb?: () => void) => cb?.())
  sock.address = vi.fn(() => ({ port: 40123 }))
  sock.close = vi.fn((cb?: () => void) => cb?.())
  sock.send = vi.fn()
  return sock
}

function opts(overrides: Partial<CpRtpDecoderOpts> = {}): CpRtpDecoderOpts {
  return {
    codec: 'opus',
    payloadType: 103,
    clockRate: 48000,
    channels: 1,
    label: 'nav',
    ...overrides
  }
}

function args(): string[] {
  return spawnMock.mock.calls[0][1] as string[]
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
  probe = fakeUdp()
  sock = fakeUdp()
  const queue = [probe, sock]
  createSpy = vi
    .spyOn(dgram, 'createSocket')
    .mockImplementation(() => (queue.shift() ?? fakeUdp()) as unknown as dgram.Socket)
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  createSpy.mockRestore()
  warnSpy.mockRestore()
  errorSpy.mockRestore()
})

describe('CpRtpAudioDecoder start', () => {
  test('fails without a bundled gstreamer', async () => {
    rootMock.mockReturnValue(null)
    await expect(new CpRtpAudioDecoder(opts()).start()).resolves.toBe(false)
    expect(errorSpy).toHaveBeenCalledWith('[cpRtpDec:nav] bundled GStreamer not found')
    expect(spawnMock).not.toHaveBeenCalled()
  })

  test('spawns a low-latency opus pipeline on the probed port', async () => {
    const dec = new CpRtpAudioDecoder(opts())
    await expect(dec.start()).resolves.toBe(true)
    const [cmd, , options] = spawnMock.mock.calls[0] as unknown as [
      string,
      string[],
      { env: Record<string, string>; shell: boolean }
    ]
    expect(cmd).toBe('/gst/bin/gst-launch-1.0')
    expect(options.env).toEqual({ GST_PLUGIN_PATH: '/gst/lib' })
    expect(options.shell).toBe(false)
    expect(gstEnv).toHaveBeenCalledWith('/gst')
    expect(args()).toContain('port=40123')
    expect(args()).toContain('latency=100')
    expect(args()).toContain('rtpopusdepay')
    expect(args().join(' ')).toContain('encoding-name=OPUS,payload=103')
    expect(args()).toContain('audio/x-raw,format=S16LE,channels=1,rate=48000')
    expect(() => sock.emit('error', new Error('drop'))).not.toThrow()
  })

  test('spawns an aac pipeline honoring the 44100 clock and negotiated latency', async () => {
    const dec = new CpRtpAudioDecoder(
      opts({ codec: 'aac-lc', payloadType: 96, clockRate: 44100, channels: 2, latencyMs: 730.4 })
    )
    await dec.start()
    expect(args()).toContain('rtpmp4gdepay')
    expect(args()).toContain('latency=730')
    expect(args().join(' ')).toContain('clock-rate=(int)44100')
    expect(args().join(' ')).toContain('config=(string)1210')
    expect(args()).toContain('audio/x-raw,format=S16LE,channels=2,rate=44100')
  })

  test('defaults the aac latency and frequency index for unknown clock rates', async () => {
    const dec = new CpRtpAudioDecoder(
      opts({ codec: 'aac-lc', payloadType: 96, clockRate: 8000, channels: 1 })
    )
    await dec.start()
    expect(args()).toContain('latency=1000')
    expect(args().join(' ')).toContain('config=(string)1188')
    expect(args()).toContain('audio/x-raw,format=S16LE,channels=1,rate=48000')
  })

  test('clamps a too-low negotiated latency to 100', async () => {
    const dec = new CpRtpAudioDecoder(
      opts({ codec: 'aac-lc', payloadType: 96, clockRate: 48000, channels: 2, latencyMs: 40 })
    )
    await dec.start()
    expect(args()).toContain('latency=100')
  })

  test('rejects when the port probe errors', async () => {
    probe.bind = vi.fn(() => probe.emit('error', new Error('EPERM')))
    await expect(new CpRtpAudioDecoder(opts()).start()).rejects.toThrow('EPERM')
  })
})

describe('CpRtpAudioDecoder data path', () => {
  test('emits decoded pcm from the pipeline stdout', async () => {
    const dec = new CpRtpAudioDecoder(opts())
    await dec.start()
    const pcm = vi.fn()
    dec.on('pcm', pcm)
    proc.stdout.emit('data', Buffer.from('decoded'))
    expect(pcm).toHaveBeenCalledWith(Buffer.from('decoded'))
  })

  test('surfaces only suspicious stderr lines', async () => {
    const dec = new CpRtpAudioDecoder(opts())
    await dec.start()
    proc.stderr.emit('data', Buffer.from('Setting pipeline to PLAYING\nERROR: no element\n'))
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith('[cpRtpDec:nav] ERROR: no element')
  })

  test('forwards opus rtp packets untouched to the pipeline port', async () => {
    const dec = new CpRtpAudioDecoder(opts())
    await dec.start()
    const rtp = Buffer.concat([Buffer.alloc(12, 0x11), Buffer.from('opus')])
    dec.write(rtp)
    expect(sock.send).toHaveBeenCalledWith(rtp, 40123, '127.0.0.1')
  })

  test('reframes aac access units with an AU header section and a forced marker', async () => {
    const dec = new CpRtpAudioDecoder(
      opts({ codec: 'aac-lc', payloadType: 96, clockRate: 44100, channels: 2 })
    )
    await dec.start()
    const header = Buffer.alloc(12, 0x22)
    const au = Buffer.from('access-unit')
    dec.write(Buffer.concat([header, au]))
    const sent = sock.send.mock.calls[0][0] as Buffer
    expect(sent.length).toBe(12 + 4 + au.length)
    expect(sent[0]).toBe(0x22)
    expect(sent[1]).toBe(0x80 | 96)
    expect(sent.subarray(12, 16).equals(Buffer.from([0x00, 0x10, 0x00, au.length << 3]))).toBe(true)
    expect(sent.subarray(16).equals(au)).toBe(true)
  })

  test('write is a no-op before start or without a port', async () => {
    const dec = new CpRtpAudioDecoder(opts())
    expect(() => dec.write(Buffer.alloc(16))).not.toThrow()
    await dec.start()
    ;(dec as unknown as { _port: number })._port = 0
    dec.write(Buffer.alloc(16))
    expect(sock.send).not.toHaveBeenCalled()
  })
})

describe('CpRtpAudioDecoder lifecycle', () => {
  test('a spawn error warns and clears the current process', async () => {
    const dec = new CpRtpAudioDecoder(opts())
    await dec.start()
    proc.emit('error', new Error('ENOENT'))
    expect(warnSpy).toHaveBeenCalledWith('[cpRtpDec:nav] spawn error: ENOENT')
    dec.stop()
    expect(proc.kill).not.toHaveBeenCalled()
  })

  test('process exit clears the current process only', async () => {
    const dec = new CpRtpAudioDecoder(opts())
    await dec.start()
    proc.emit('close')
    dec.stop()
    expect(proc.kill).not.toHaveBeenCalled()
  })

  test('late error and close events from a replaced process are ignored', async () => {
    const dec = new CpRtpAudioDecoder(opts())
    await dec.start()
    dec.stop()
    const second = fakeProc()
    spawnMock.mockReturnValue(second as never)
    await dec.start()
    proc.emit('error', new Error('late'))
    proc.emit('close')
    dec.stop()
    expect(second.kill).toHaveBeenCalled()
  })

  test('stop kills the process, closes the socket and tolerates repeats', async () => {
    const dec = new CpRtpAudioDecoder(opts())
    await dec.start()
    dec.stop()
    expect(proc.kill).toHaveBeenCalled()
    expect(sock.close).toHaveBeenCalled()
    dec.stop()
    expect(proc.kill).toHaveBeenCalledTimes(1)
  })

  test('stop swallows kill errors', async () => {
    const dec = new CpRtpAudioDecoder(opts())
    await dec.start()
    proc.kill = vi.fn(() => {
      throw new Error('ESRCH')
    })
    expect(() => dec.stop()).not.toThrow()
  })
})
