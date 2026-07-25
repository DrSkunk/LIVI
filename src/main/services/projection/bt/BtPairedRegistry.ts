import type { ProjectionEvent } from '../services/types'

export type BtPairedRegistryDeps = {
  emit: (payload: ProjectionEvent) => void
  hasRenderer: () => boolean
}

/**
 * Owns the combined Bluetooth paired-list state: the two raw sources (host BlueZ
 * and dongle firmware) and the merge that the device picker consumes.
 */
export class BtPairedRegistry {
  private hostPairedRaw = ''
  private donglePairedRaw = ''

  constructor(private readonly deps: BtPairedRegistryDeps) {}

  setHostPairedRaw(raw: string): void {
    this.hostPairedRaw = raw
  }

  setDonglePairedRaw(raw: string): void {
    this.donglePairedRaw = raw
    this.emitCombined()
  }

  clearDongleRaw(): void {
    this.donglePairedRaw = ''
  }

  // Merge dongle + host lists (dongle wins on MAC collision) and emit the combined list.
  emitCombined(): void {
    if (!this.deps.hasRenderer()) return
    const parse = (raw: string): Array<{ mac: string; line: string }> => {
      const out: Array<{ mac: string; line: string }> = []
      for (const line of raw.split('\n')) {
        const trimmed = line.replace(/\r$/, '').replace(/\0+$/g, '')
        if (trimmed.length < 17) continue
        const mac = trimmed.slice(0, 17).toUpperCase()
        if (!mac.includes(':')) continue
        out.push({ mac, line: trimmed })
      }
      return out
    }
    const dongle = parse(this.donglePairedRaw)
    const dongleMacs = new Set(dongle.map((d) => d.mac))
    const host = parse(this.hostPairedRaw).filter((h) => !dongleMacs.has(h.mac))
    const all = [...dongle, ...host]
    const raw = all.length ? all.map((d) => d.line).join('\n') + '\n' : ''
    this.deps.emit({ type: 'bluetoothPairedList', payload: raw })
  }
}
