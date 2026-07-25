import { app } from 'electron'
import fs from 'fs'
import path from 'path'

function platformDir(): string | null {
  switch (process.platform) {
    case 'darwin':
      return 'macos-arm64'
    case 'linux':
      return process.arch === 'arm64' ? 'linux-arm64' : process.arch === 'x64' ? 'linux-x64' : null
    default:
      return null
  }
}

export function resolveGStreamerRoot(): string | null {
  const dir = platformDir()
  if (!dir) return null
  const base = app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'assets')
  const bundled = path.join(base, 'gstreamer', dir)
  return fs.existsSync(bundled) ? bundled : null
}

export function resolveBinary(name: 'gst-launch-1.0' | 'gst-device-monitor-1.0'): string | null {
  const root = resolveGStreamerRoot()
  if (!root) return null
  return path.join(root, 'bin', name)
}

export function gstEnv(gstRoot: string): NodeJS.ProcessEnv {
  const pluginPath = path.join(gstRoot, 'lib', 'gstreamer-1.0')
  const pluginScanner = path.join(gstRoot, 'libexec', 'gstreamer-1.0', 'gst-plugin-scanner')
  const lcUtf8 = process.platform === 'darwin' ? 'en_US.UTF-8' : 'C.UTF-8'
  const base = {
    ...process.env,
    LANG: lcUtf8,
    LC_ALL: lcUtf8,
    GST_PLUGIN_SYSTEM_PATH: '',
    GST_PLUGIN_PATH: pluginPath,
    GST_PLUGIN_SCANNER: pluginScanner
  }
  if (process.platform === 'darwin') {
    return { ...base, DYLD_LIBRARY_PATH: path.join(gstRoot, 'lib') }
  }
  return { ...base, LD_LIBRARY_PATH: path.join(gstRoot, 'lib') }
}

export function audioSinkElement(): string {
  if (process.platform === 'darwin') return 'osxaudiosink'
  return 'pulsesink'
}

export function audioSourceElement(): string {
  if (process.platform === 'darwin') return 'osxaudiosrc'
  return 'pulsesrc'
}

// pulsesink/pulsesrc: device=<string>
// osxaudiosink/osxaudiosrc: unique-id=<string>
export function audioDeviceProp(): 'device' | 'unique-id' {
  if (process.platform === 'darwin') return 'unique-id'
  return 'device'
}

export type AudioCodec = 'aac-lc' | 'opus'

// AAC-LC decode: faad on linux (tiny, bundled for the Pi), avdec_aac on mac
// (libav is already bundled there for video). Opus decodes via opusdec everywhere.
export function audioDecoderElement(codec: AudioCodec): string {
  if (codec === 'opus') return 'opusdec'
  return process.platform === 'linux' ? 'faad' : 'avdec_aac'
}

export type VideoCodec = 'h264' | 'h265'

export function videoParseElement(codec: VideoCodec): string {
  return codec === 'h265' ? 'h265parse' : 'h264parse'
}

// HW-accelerated decoder per platform. Linux is refined on-device
export function videoDecoderElement(codec: VideoCodec): string {
  if (process.platform === 'darwin') return 'vtdec'
  return codec === 'h265' ? 'v4l2slh265dec' : 'v4l2slh264dec'
}

export function videoSinkElement(): string {
  return 'glimagesink'
}
