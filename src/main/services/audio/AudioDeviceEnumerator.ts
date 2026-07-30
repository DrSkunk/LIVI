import { DEBUG } from '@main/constants'
import { type ChildProcess, execFile, spawn } from 'child_process'
import { gstEnv, resolveBinary, resolveGStreamerRoot } from './gstreamer'

export type AudioDeviceKind = 'sink' | 'source'

export type AudioDevice = {
  id: string
  // Human-friendly name for the dropdown
  name: string
  // True if the OS reports this as the default device
  isDefault: boolean
  offline?: boolean
}

const ENUMERATE_TIMEOUT_MS = 4_000

export async function listAudioDevices(kind: AudioDeviceKind): Promise<AudioDevice[]> {
  const root = resolveGStreamerRoot()
  const bin = resolveBinary('gst-device-monitor-1.0')
  if (!root || !bin) {
    if (DEBUG) console.warn('[AudioDeviceEnumerator] GStreamer bundle missing')
    return []
  }

  const filter = kind === 'sink' ? 'Audio/Sink' : 'Audio/Source'

  return new Promise((resolve) => {
    execFile(
      bin,
      [filter],
      { env: gstEnv(root), timeout: ENUMERATE_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          if (DEBUG) console.warn('[AudioDeviceEnumerator] gst-device-monitor failed', err.message)
          resolve([])
          return
        }
        resolve(parseDeviceMonitorOutput(stdout, kind))
      }
    )
  })
}

export function parseDeviceMonitorOutput(stdout: string, kind: AudioDeviceKind): AudioDevice[] {
  const devices: AudioDevice[] = []
  const blocks = stdout.split(/^\s*Device found:\s*$/m)
  for (const block of blocks) {
    if (!block.trim()) continue

    const cls = matchProp(block, 'class')
    if (!cls) continue
    const expectedClass = kind === 'sink' ? 'Audio/Sink' : 'Audio/Source'
    if (!cls.includes(expectedClass)) continue

    // Skip PulseAudio/PipeWire monitor sources (loopback of a sink, not a
    // real capture device).
    if (kind === 'source' && matchProp(block, 'device.class') === 'monitor') continue

    const id =
      idFromLaunchLine(block) ??
      matchProp(block, 'unique-id') ??
      matchProp(block, 'device.name') ??
      matchProp(block, 'node.name') ??
      matchProp(block, 'alsa.card_name') ??
      matchProp(block, 'name')
    if (!id) continue

    const name =
      matchProp(block, 'name') ??
      matchProp(block, 'device.description') ??
      matchProp(block, 'node.description') ??
      matchProp(block, 'alsa.long_card_name') ??
      id

    const isDefault =
      /^\s*default:\s*true\s*$/im.test(block) ||
      matchProp(block, 'is-default') === 'true' ||
      matchProp(block, 'is-default') === 'true (gboolean)' ||
      matchProp(block, 'node.is-default') === 'true'

    devices.push({ id, name, isDefault })
  }

  const seen = new Set<string>()
  return devices.filter((d) => (seen.has(d.id) ? false : (seen.add(d.id), true)))
}

// gst-device-monitor prints a sample launch line per device, e.g.
//   gst-launch-1.0 ... ! osxaudiosink device=53
//   gst-launch-1.0 ... ! 'pulsesink device=alsa_output.platform-fef00700.hdmi.hdmi-stereo'
// We pull whatever follows device= and stop at the first
// unquoted whitespace, end of line, or closing quote.
function idFromLaunchLine(block: string): string | null {
  const launch = block.match(/gst-launch-1\.0[^\n]*/m)
  if (!launch) return null
  const line = launch[0]
  // GStreamer 1.28+ uses unique-id on osxaudio; pulse uses device. Catch both.
  const m = line.match(/\b(?:unique-id|device)=("([^"]*)"|'([^']*)'|([^\s'"]+))/)
  if (!m) return null
  return m[2] ?? m[3] ?? m[4]
}

function matchProp(block: string, key: string): string | null {
  const escaped = key.replace(/[.[\]]/g, (c) => '\\' + c)
  const re = new RegExp(`^\\s*${escaped}\\s*[:=]\\s*(.+?)\\s*$`, 'm')
  const m = block.match(re)
  if (!m) return null
  return m[1].replace(/^"(.*)"$/, '$1')
}

const TOPOLOGY_EVENT_RE = /^\s*Device\s+\S+\s*:\s*$/m
const DEBOUNCE_MS = 250
const RESTART_DELAY_MS = 2_000

export type AudioDeviceMonitorHandle = { stop: () => void }

// Spawn gst-device-monitor -f; call onChange (debounced) per device change
export function startAudioDeviceMonitor(onChange: () => void): AudioDeviceMonitorHandle {
  let root: string | null = null
  let bin: string | null = null
  try {
    root = resolveGStreamerRoot()
    bin = resolveBinary('gst-device-monitor-1.0')
  } catch (e) {
    if (DEBUG) console.warn('[AudioDeviceEnumerator] gst lookup failed', e)
  }
  if (!root || !bin) {
    if (DEBUG) console.warn('[AudioDeviceEnumerator] GStreamer bundle missing — monitor disabled')
    return { stop: () => {} }
  }
  const monitorRoot = root
  const monitorBin = bin

  let stopped = false
  let child: ChildProcess | null = null
  let restartTimer: ReturnType<typeof setTimeout> | null = null
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  const fire = (): void => {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      try {
        onChange()
      } catch (e) {
        if (DEBUG) console.warn('[AudioDeviceEnumerator] onChange threw', e)
      }
    }, DEBOUNCE_MS)
  }

  const spawnMonitor = (): void => {
    if (stopped) return
    const proc = spawn(monitorBin, ['-f', 'Audio/Sink', 'Audio/Source'], {
      env: gstEnv(monitorRoot),
      stdio: ['ignore', 'pipe', 'pipe']
    })
    child = proc

    let buf = ''
    proc.stdout?.setEncoding('utf8')
    proc.stdout?.on('data', (chunk: string) => {
      buf += chunk
      let nl: number
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        if (TOPOLOGY_EVENT_RE.test(line + '\n')) {
          if (DEBUG) console.log(`[AudioDeviceEnumerator] monitor event: ${line.trim()}`)
          fire()
        }
      }
    })
    proc.on('error', (err) => {
      if (DEBUG) console.warn('[AudioDeviceEnumerator] monitor process error', err.message)
    })
    proc.on('exit', () => {
      child = null
      if (stopped) return
      restartTimer = setTimeout(spawnMonitor, RESTART_DELAY_MS)
    })
  }

  spawnMonitor()

  return {
    stop: () => {
      stopped = true
      if (debounceTimer) clearTimeout(debounceTimer)
      if (restartTimer) clearTimeout(restartTimer)
      if (child && !child.killed) {
        try {
          child.kill()
        } catch {
          /* already gone */
        }
      }
    }
  }
}
