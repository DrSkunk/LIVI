import { registerIpcHandle } from '@main/ipc/register'
import { type AudioDevice, listAudioDevices } from '@main/services/audio/AudioDeviceEnumerator'
import { BluezDeviceClient } from '@main/services/projection/bt/BluezDeviceClient'

// CoD Major 0x04 = Audio/Video (headphones, speakers, car kits)
const BT_COD_MAJOR_AUDIO = 0x04
function isBtAudioCod(cod: number | undefined | null): boolean {
  if (typeof cod !== 'number' || cod <= 0) return false
  return ((cod >> 8) & 0x1f) === BT_COD_MAJOR_AUDIO
}

function macToBluezId(mac: string): string {
  return mac.toUpperCase().replace(/:/g, '_')
}

// PipeWire uses underscores for bluez_output and colons for bluez_input
function extractBluezMac(deviceId: string): string | null {
  const m = deviceId.match(/^bluez_(?:output|input|sink|source)\.([0-9A-Fa-f_:]{17})/)
  return m ? m[1]!.replace(/_/g, ':').toUpperCase() : null
}

async function listPairedBtAudio(
  kind: 'sink' | 'source'
): Promise<Array<{ mac: string; name: string }>> {
  if (process.platform !== 'linux') return []
  const client = new BluezDeviceClient()
  let paired: Array<{ mac: string; name: string; class?: number }>
  try {
    paired = await client.listPaired(2000)
  } catch {
    return []
  }
  void kind
  return paired
    .filter((d) => isBtAudioCod(d.class))
    .map((d) => ({ mac: d.mac, name: d.name || d.mac }))
}

// Collapse multiple BT profile nodes (a2dp / hfp / hsp) per MAC into one entry
function dedupeBtPerMac(devices: AudioDevice[]): { deduped: AudioDevice[]; macs: Set<string> } {
  const seen = new Set<string>()
  const deduped: AudioDevice[] = []
  for (const d of devices) {
    const mac = extractBluezMac(d.id)
    if (mac) {
      if (seen.has(mac)) continue
      seen.add(mac)
    }
    deduped.push(d)
  }
  return { deduped, macs: seen }
}

async function mixedAudioDevices(kind: 'sink' | 'source'): Promise<AudioDevice[]> {
  const local = await listAudioDevices(kind)
  const { deduped, macs: liveMacs } = dedupeBtPerMac(local)
  const paired = await listPairedBtAudio(kind)
  if (paired.length === 0) return deduped

  const liveNames = new Set(deduped.map((d) => d.name.trim().toLowerCase()))
  const offlineEntries: AudioDevice[] = paired
    .filter((p) => {
      if (liveMacs.has(p.mac.toUpperCase())) return false
      if (liveNames.has(p.name.trim().toLowerCase())) return false
      return true
    })
    .map((p) => ({
      id:
        kind === 'sink'
          ? `bluez_output.${macToBluezId(p.mac)}.0`
          : `bluez_input.${p.mac.toUpperCase()}`,
      name: p.name,
      isDefault: false,
      offline: true
    }))

  return [...deduped, ...offlineEntries]
}

export function registerAudioIpc(): void {
  registerIpcHandle('audio:listSinks', async () => mixedAudioDevices('sink'))
  registerIpcHandle('audio:listSources', async () => mixedAudioDevices('source'))
}
