import { EventEmitter } from 'node:events'
import {
  listAudioDevices,
  parseDeviceMonitorOutput,
  startAudioDeviceMonitor
} from '../AudioDeviceEnumerator'

const { resolveGStreamerRoot, resolveBinary, gstEnv } = vi.hoisted(() => ({
  resolveGStreamerRoot: vi.fn(),
  resolveBinary: vi.fn(),
  gstEnv: vi.fn(() => ({}))
}))
vi.mock('../gstreamer', () => ({ resolveGStreamerRoot, resolveBinary, gstEnv }))

const { execFile, spawn } = vi.hoisted(() => ({ execFile: vi.fn(), spawn: vi.fn() }))
vi.mock('child_process', () => ({ execFile, spawn }))

// Real-shape sample from `gst-device-monitor-1.0 Audio/Sink` on a Pi running
// PipeWire. Trimmed but structurally faithful.
const PIPEWIRE_SINK_SAMPLE = `Probing devices...

Device found:

	name  : Built-in Audio Analog Stereo
	class : Audio/Sink
	caps  : audio/x-raw, format=(string)S16LE
	properties:
		device.name = alsa_output.platform-fef00700.hdmi.hdmi-stereo
		device.description = Built-in Audio Analog Stereo
		device.class = sound
		node.name = alsa_output.platform-fef00700.hdmi.hdmi-stereo
	gst-launch-1.0 ... ! pulsesink

Device found:

	name  : HDA NVidia HDMI
	class : Audio/Sink
	properties:
		device.name = alsa_output.pci-0000_01_00.1.hdmi-stereo
		device.description = HDA NVidia HDMI
		is-default = true
	gst-launch-1.0 ... ! pulsesink
`

const PIPEWIRE_SOURCE_SAMPLE = `Probing devices...

Device found:

	name  : Built-in Audio Analog Mono
	class : Audio/Source
	properties:
		device.name = alsa_input.usb-Plantronics.mono
		device.description = Plantronics Audio
		is-default = true
`

const MIXED_SAMPLE = `${PIPEWIRE_SINK_SAMPLE}\n${PIPEWIRE_SOURCE_SAMPLE}`

describe('parseDeviceMonitorOutput', () => {
  test('parses Audio/Sink blocks from a PipeWire-shaped output', () => {
    const devices = parseDeviceMonitorOutput(PIPEWIRE_SINK_SAMPLE, 'sink')
    expect(devices).toHaveLength(2)
    expect(devices[0]).toEqual({
      id: 'alsa_output.platform-fef00700.hdmi.hdmi-stereo',
      name: 'Built-in Audio Analog Stereo',
      isDefault: false
    })
    expect(devices[1]).toEqual({
      id: 'alsa_output.pci-0000_01_00.1.hdmi-stereo',
      name: 'HDA NVidia HDMI',
      isDefault: true
    })
  })

  test('parses Audio/Source blocks separately', () => {
    const devices = parseDeviceMonitorOutput(PIPEWIRE_SOURCE_SAMPLE, 'source')
    expect(devices).toHaveLength(1)
    expect(devices[0].id).toBe('alsa_input.usb-Plantronics.mono')
    expect(devices[0].isDefault).toBe(true)
  })

  test('filters by kind when both sinks and sources are in the output', () => {
    expect(parseDeviceMonitorOutput(MIXED_SAMPLE, 'sink')).toHaveLength(2)
    expect(parseDeviceMonitorOutput(MIXED_SAMPLE, 'source')).toHaveLength(1)
  })

  test('returns empty when the output is empty or non-matching', () => {
    expect(parseDeviceMonitorOutput('', 'sink')).toEqual([])
    expect(parseDeviceMonitorOutput('Probing devices...\nnothing here', 'sink')).toEqual([])
  })

  test('deduplicates devices that appear under multiple providers (same device.name)', () => {
    const dup = `Device found:

	class : Audio/Sink
	properties:
		device.name = same_id
		device.description = First listing

Device found:

	class : Audio/Sink
	properties:
		device.name = same_id
		device.description = Second listing
`
    const devices = parseDeviceMonitorOutput(dup, 'sink')
    expect(devices).toHaveLength(1)
    expect(devices[0].name).toBe('First listing')
  })

  test('falls back to node.name when device.name is absent', () => {
    const block = `Device found:

	class : Audio/Sink
	properties:
		node.name = node_only_id
		node.description = Node Only Device
`
    const devices = parseDeviceMonitorOutput(block, 'sink')
    expect(devices[0]).toEqual({
      id: 'node_only_id',
      name: 'Node Only Device',
      isDefault: false
    })
  })

  test('strips surrounding quotes from property values', () => {
    const block = `Device found:

	class : Audio/Sink
	properties:
		device.name = "quoted_id"
		device.description = "Quoted Description"
`
    const devices = parseDeviceMonitorOutput(block, 'sink')
    expect(devices[0].id).toBe('quoted_id')
    expect(devices[0].name).toBe('Quoted Description')
  })

  test('macOS osxaudio-shaped output also parses', () => {
    const mac = `Device found:

	name  : MacBook Pro Speakers
	class : Audio/Sink
	properties:
		device.name = osx-built-in-output
		device.description = MacBook Pro Speakers
`
    const devices = parseDeviceMonitorOutput(mac, 'sink')
    expect(devices).toHaveLength(1)
    expect(devices[0].id).toBe('osx-built-in-output')
  })

  test('macOS GStreamer 1.28 unique-id launch line is parsed correctly', () => {
    // Real shape from gst-device-monitor-1.0 1.28.2 on macOS:
    //   properties:
    //     is-default = true (gboolean)
    //     unique-id = BuiltInSpeakerDevice
    //   gst-launch-1.0 ... ! osxaudiosink unique-id=BuiltInSpeakerDevice
    const mac = `Device found:

	name  : MacBook Pro-Lautsprecher
	class : Audio/Sink
	properties:
		is-default = true (gboolean)
		transport = bltn
		unique-id = BuiltInSpeakerDevice
	gst-launch-1.0 ... ! osxaudiosink unique-id=BuiltInSpeakerDevice
`
    const devices = parseDeviceMonitorOutput(mac, 'sink')
    expect(devices).toHaveLength(1)
    expect(devices[0].id).toBe('BuiltInSpeakerDevice')
    expect(devices[0].name).toBe('MacBook Pro-Lautsprecher')
    expect(devices[0].isDefault).toBe(true)
  })

  test('linux launch line gives string device-name verbatim', () => {
    const linux = `Device found:

	name  : Built-in Audio
	class : Audio/Sink
	properties:
		device.name = alsa_output.platform-fef00700.hdmi.hdmi-stereo
		device.description = Built-in Audio
	gst-launch-1.0 ... ! 'pulsesink device=alsa_output.platform-fef00700.hdmi.hdmi-stereo'
`
    const devices = parseDeviceMonitorOutput(linux, 'sink')
    expect(devices[0].id).toBe('alsa_output.platform-fef00700.hdmi.hdmi-stereo')
  })

  test('falls back to properties when no launch line is present', () => {
    const block = `Device found:

	class : Audio/Sink
	properties:
		device.name = fallback_id
		device.description = Fallback Device
`
    const devices = parseDeviceMonitorOutput(block, 'sink')
    expect(devices[0].id).toBe('fallback_id')
  })

  test('prefers the top "name" header over device.description for the display label', () => {
    // Real shape on Pi5 with vc4-hdmi: device.description is bare "Built-in Audio",
    // top header carries the descriptive "Built-in Audio Digital Stereo (HDMI)"
    const block = `Device found:

	name  : Built-in Audio Digital Stereo (HDMI)
	class : Audio/Sink
	properties:
		device.description = Built-in Audio
		device.name = alsa_card.platform-107c706400.hdmi
	gst-launch-1.0 ... ! pulsesink device='alsa_output.platform-107c706400.hdmi.hdmi-stereo'
`
    const devices = parseDeviceMonitorOutput(block, 'sink')
    expect(devices[0].name).toBe('Built-in Audio Digital Stereo (HDMI)')
  })

  test('filters out PulseAudio/PipeWire monitor sources from the source list', () => {
    const block = `Device found:

	name  : Monitor of NEEWER UM04 Analog Stereo
	class : Audio/Source
	properties:
		device.class = monitor
		device.description = NEEWER UM04
	gst-launch-1.0 pulsesrc device='alsa_output.usb-NEEWER.analog-stereo.monitor' ! ...

Device found:

	name  : NEEWER UM04 Mono
	class : Audio/Source
	properties:
		device.class = sound
		device.description = NEEWER UM04
	gst-launch-1.0 pulsesrc device='alsa_input.usb-NEEWER.mono-fallback' ! ...
`
    const devices = parseDeviceMonitorOutput(block, 'source')
    expect(devices).toHaveLength(1)
    expect(devices[0].name).toBe('NEEWER UM04 Mono')
    expect(devices[0].id).toBe('alsa_input.usb-NEEWER.mono-fallback')
  })

  test('falls back to alsa card names when pulse properties are missing', () => {
    const block = `Device found:

	class : Audio/Sink
	properties:
		alsa.card_name = HDA Intel
		alsa.long_card_name = HDA Intel PCH at 0x601d118000
`
    const devices = parseDeviceMonitorOutput(block, 'sink')
    expect(devices[0]).toEqual({
      id: 'HDA Intel',
      name: 'HDA Intel PCH at 0x601d118000',
      isDefault: false
    })
  })

  test('uses the name header as id when nothing else identifies the device', () => {
    const block = `Device found:

	name  : Bare Device
	class : Audio/Sink
`
    const devices = parseDeviceMonitorOutput(block, 'sink')
    expect(devices[0]).toEqual({ id: 'Bare Device', name: 'Bare Device', isDefault: false })
  })

  test('falls back to the id as display name', () => {
    const block = `Device found:

	class : Audio/Sink
	properties:
		unique-id = uid-42
`
    const devices = parseDeviceMonitorOutput(block, 'sink')
    expect(devices[0]).toEqual({ id: 'uid-42', name: 'uid-42', isDefault: false })
  })

  test('skips blocks without any identifier', () => {
    const block = `Device found:

	class : Audio/Sink
`
    expect(parseDeviceMonitorOutput(block, 'sink')).toEqual([])
  })

  test('reads double-quoted device ids from the launch line', () => {
    const block = `Device found:

	name  : Quoted
	class : Audio/Sink
	gst-launch-1.0 ... ! pulsesink device="quoted device id"
`
    const devices = parseDeviceMonitorOutput(block, 'sink')
    expect(devices[0].id).toBe('quoted device id')
  })

  test('a block whose class does not match is skipped', () => {
    const otherKind = `Device found:

	class : Video/Source
	properties:
		device.name = camera0
`
    expect(parseDeviceMonitorOutput(otherKind, 'sink')).toEqual([])
    expect(parseDeviceMonitorOutput(otherKind, 'source')).toEqual([])
  })
})

const SINK_SAMPLE = `Device found:

	name  : Speakers
	class : Audio/Sink
	properties:
		device.name = alsa_output.builtin
		device.description = Speakers
`

describe('listAudioDevices', () => {
  beforeEach(() => {
    resolveGStreamerRoot.mockReset()
    resolveBinary.mockReset()
    execFile.mockReset()
    resolveGStreamerRoot.mockReturnValue('/gst')
    resolveBinary.mockReturnValue('/gst/bin/gst-device-monitor-1.0')
  })

  test('returns the parsed devices on success', async () => {
    execFile.mockImplementation((_bin, _args, _opts, cb) => cb(null, SINK_SAMPLE))

    const devices = await listAudioDevices('sink')
    expect(devices).toEqual([{ id: 'alsa_output.builtin', name: 'Speakers', isDefault: false }])
  })

  test('passes the kind-specific class filter to the monitor', async () => {
    execFile.mockImplementation((_bin, _args, _opts, cb) => cb(null, ''))

    await listAudioDevices('source')
    expect(execFile).toHaveBeenCalledWith(
      '/gst/bin/gst-device-monitor-1.0',
      ['Audio/Source'],
      expect.any(Object),
      expect.any(Function)
    )
  })

  test('resolves to an empty list when the monitor process errors', async () => {
    execFile.mockImplementation((_bin, _args, _opts, cb) => cb(new Error('spawn failed'), ''))

    await expect(listAudioDevices('sink')).resolves.toEqual([])
  })

  test('returns an empty list when the GStreamer bundle is missing', async () => {
    resolveBinary.mockReturnValue(null)

    await expect(listAudioDevices('sink')).resolves.toEqual([])
    expect(execFile).not.toHaveBeenCalled()
  })
})

function makeFakeChild() {
  const stdout = new EventEmitter() as EventEmitter & { setEncoding: (e: string) => void }
  stdout.setEncoding = vi.fn()
  const child = new EventEmitter() as EventEmitter & {
    stdout: typeof stdout
    kill: () => void
    killed: boolean
  }
  child.stdout = stdout
  child.kill = vi.fn()
  child.killed = false
  return child
}

describe('startAudioDeviceMonitor', () => {
  beforeEach(() => {
    resolveGStreamerRoot.mockReset()
    resolveBinary.mockReset()
    spawn.mockReset()
    resolveGStreamerRoot.mockReturnValue('/gst')
    resolveBinary.mockReturnValue('/gst/bin/gst-device-monitor-1.0')
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('fires a debounced onChange on a topology event', () => {
    const child = makeFakeChild()
    spawn.mockReturnValue(child)
    const onChange = vi.fn()

    const handle = startAudioDeviceMonitor(onChange)
    child.stdout.emit('data', 'Device alsa_output.builtin :\n')

    expect(onChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(250)
    expect(onChange).toHaveBeenCalledTimes(1)

    handle.stop()
    expect(child.kill).toHaveBeenCalled()
  })

  test('debounces bursts of topology events into a single onChange', () => {
    const child = makeFakeChild()
    spawn.mockReturnValue(child)
    const onChange = vi.fn()

    const handle = startAudioDeviceMonitor(onChange)
    child.stdout.emit('data', 'Device sink_a :\nDevice sink_b :\n')
    child.stdout.emit('data', 'Device sink_c :\n')

    vi.advanceTimersByTime(250)
    expect(onChange).toHaveBeenCalledTimes(1)

    handle.stop()
  })

  test('ignores non-topology output lines', () => {
    const child = makeFakeChild()
    spawn.mockReturnValue(child)
    const onChange = vi.fn()

    startAudioDeviceMonitor(onChange)
    child.stdout.emit('data', 'Probing devices...\nsome noise\n')
    vi.advanceTimersByTime(250)

    expect(onChange).not.toHaveBeenCalled()
  })

  test('restarts the monitor after the child exits', () => {
    const first = makeFakeChild()
    const second = makeFakeChild()
    let n = 0
    spawn.mockImplementation(() => (++n === 1 ? first : second))

    startAudioDeviceMonitor(vi.fn())
    expect(spawn).toHaveBeenCalledTimes(1)

    first.emit('exit')
    vi.advanceTimersByTime(2000)
    expect(spawn).toHaveBeenCalledTimes(2)
  })

  test('returns a no-op handle when the GStreamer bundle is missing', () => {
    resolveBinary.mockReturnValue(null)

    const handle = startAudioDeviceMonitor(vi.fn())
    expect(() => handle.stop()).not.toThrow()
    expect(spawn).not.toHaveBeenCalled()
  })

  test('returns a no-op handle when the gstreamer lookup throws', () => {
    resolveGStreamerRoot.mockImplementation(() => {
      throw new Error('bad bundle')
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const handle = startAudioDeviceMonitor(vi.fn())
    expect(() => handle.stop()).not.toThrow()
    expect(spawn).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  test('survives monitor process errors without warning outside debug builds', () => {
    const child = makeFakeChild()
    spawn.mockReturnValue(child)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const handle = startAudioDeviceMonitor(vi.fn())
    expect(() => child.emit('error', new Error('spawn failed'))).not.toThrow()
    expect(warnSpy).not.toHaveBeenCalled()

    handle.stop()
    warnSpy.mockRestore()
  })

  test('swallows onChange errors', () => {
    const child = makeFakeChild()
    spawn.mockReturnValue(child)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const onChange = vi.fn(() => {
      throw new Error('boom')
    })

    const handle = startAudioDeviceMonitor(onChange)
    child.stdout.emit('data', 'Device alsa_output.builtin :\n')
    expect(() => vi.advanceTimersByTime(250)).not.toThrow()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(warnSpy).not.toHaveBeenCalled()

    handle.stop()
    warnSpy.mockRestore()
  })

  test('stop clears a pending debounce and ignores later exits', () => {
    const child = makeFakeChild()
    spawn.mockReturnValue(child)
    const onChange = vi.fn()

    const handle = startAudioDeviceMonitor(onChange)
    child.stdout.emit('data', 'Device alsa_output.builtin :\n')
    handle.stop()
    vi.advanceTimersByTime(300)
    expect(onChange).not.toHaveBeenCalled()

    child.emit('exit')
    vi.advanceTimersByTime(2000)
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  test('stop cancels a scheduled restart', () => {
    const child = makeFakeChild()
    spawn.mockReturnValue(child)

    const handle = startAudioDeviceMonitor(vi.fn())
    child.emit('exit')
    handle.stop()
    vi.advanceTimersByTime(2000)
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  test('a restart scheduled before stop never respawns afterwards', () => {
    const child = makeFakeChild()
    spawn.mockReturnValue(child)

    const handle = startAudioDeviceMonitor(vi.fn())
    child.emit('exit')
    child.emit('exit')
    handle.stop()
    vi.advanceTimersByTime(2000)
    expect(spawn).toHaveBeenCalledTimes(1)
  })

  test('stop skips killing an already dead child', () => {
    const child = makeFakeChild()
    child.killed = true
    spawn.mockReturnValue(child)

    const handle = startAudioDeviceMonitor(vi.fn())
    handle.stop()
    expect(child.kill).not.toHaveBeenCalled()
  })

  test('stop survives a kill that throws', () => {
    const child = makeFakeChild()
    child.kill = vi.fn(() => {
      throw new Error('ESRCH')
    })
    spawn.mockReturnValue(child)

    const handle = startAudioDeviceMonitor(vi.fn())
    expect(() => handle.stop()).not.toThrow()
  })
})

describe('AudioDeviceEnumerator with DEBUG enabled', () => {
  async function loadDebug(): Promise<typeof import('../AudioDeviceEnumerator')> {
    vi.resetModules()
    vi.doMock('@main/constants', () => ({ DEBUG: true }))
    return await import('../AudioDeviceEnumerator')
  }

  let warnSpy: ReturnType<typeof vi.spyOn>
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resolveGStreamerRoot.mockReset()
    resolveBinary.mockReset()
    execFile.mockReset()
    spawn.mockReset()
    resolveGStreamerRoot.mockReturnValue('/gst')
    resolveBinary.mockReturnValue('/gst/bin/gst-device-monitor-1.0')
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  })

  afterEach(() => {
    warnSpy.mockRestore()
    logSpy.mockRestore()
    vi.useRealTimers()
  })

  test('warns when the bundle is missing while listing devices', async () => {
    const mod = await loadDebug()
    resolveGStreamerRoot.mockReturnValue(null)
    resolveBinary.mockReturnValue(null)

    await expect(mod.listAudioDevices('sink')).resolves.toEqual([])
    expect(warnSpy).toHaveBeenCalledWith('[AudioDeviceEnumerator] GStreamer bundle missing')
  })

  test('warns when gst-device-monitor fails', async () => {
    const mod = await loadDebug()
    execFile.mockImplementation((_bin, _args, _opts, cb) => cb(new Error('exec failed'), ''))

    await expect(mod.listAudioDevices('sink')).resolves.toEqual([])
    expect(warnSpy).toHaveBeenCalledWith(
      '[AudioDeviceEnumerator] gst-device-monitor failed',
      'exec failed'
    )
  })

  test('warns when the gstreamer lookup throws and disables the monitor', async () => {
    const mod = await loadDebug()
    resolveGStreamerRoot.mockImplementation(() => {
      throw new Error('bad bundle')
    })

    const handle = mod.startAudioDeviceMonitor(vi.fn())
    expect(() => handle.stop()).not.toThrow()
    expect(spawn).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      '[AudioDeviceEnumerator] gst lookup failed',
      expect.any(Error)
    )
    expect(warnSpy).toHaveBeenCalledWith(
      '[AudioDeviceEnumerator] GStreamer bundle missing — monitor disabled'
    )
  })

  test('logs topology events and warns when onChange throws', async () => {
    vi.useFakeTimers()
    const mod = await loadDebug()
    const child = makeFakeChild()
    spawn.mockReturnValue(child)
    const onChange = vi.fn(() => {
      throw new Error('boom')
    })

    const handle = mod.startAudioDeviceMonitor(onChange)
    child.stdout.emit('data', 'Device alsa_output.builtin :\n')
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AudioDeviceEnumerator] monitor event:')
    )

    vi.advanceTimersByTime(250)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledWith(
      '[AudioDeviceEnumerator] onChange threw',
      expect.any(Error)
    )

    handle.stop()
  })

  test('warns on monitor process errors', async () => {
    const mod = await loadDebug()
    const child = makeFakeChild()
    spawn.mockReturnValue(child)

    const handle = mod.startAudioDeviceMonitor(vi.fn())
    child.emit('error', new Error('spawn failed'))
    expect(warnSpy).toHaveBeenCalledWith(
      '[AudioDeviceEnumerator] monitor process error',
      'spawn failed'
    )

    handle.stop()
  })
})
