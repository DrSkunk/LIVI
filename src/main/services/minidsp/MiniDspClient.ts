import type { MiniDspConfig, MiniDspStatus } from '@shared/types'

type DeviceSummary = {
  product_name?: string
}

type DeviceStatusResponse = {
  master?: {
    preset?: number
    source?: string
    volume?: number
    mute?: boolean
  }
  product_name?: string
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

export interface MiniDspController {
  getStatus(): Promise<MiniDspStatus>
  setVolume(volumeDb: number): Promise<void>
  setBassGain(gainDb: number): Promise<void>
  selectPreset(preset: number): Promise<void>
}

export class MiniDspClient implements MiniDspController {
  constructor(private readonly config: MiniDspConfig) {}

  private baseUrl(): string {
    const base = this.config.serverUrl.trim().replace(/\/+$/, '')
    if (!/^https?:\/\//i.test(base)) throw new Error('MiniDSP server URL must use http or https')
    return base
  }

  private endpoint(path = '', deviceScoped = true): string {
    if (!deviceScoped) return `${this.baseUrl()}${path}`
    return `${this.baseUrl()}/devices/${Math.max(0, Math.floor(this.config.deviceIndex))}${path}`
  }

  private async request<T>(path = '', init?: RequestInit, deviceScoped = true): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    try {
      const response = await fetch(this.endpoint(path, deviceScoped), {
        ...init,
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...init?.headers }
      })
      if (!response.ok) {
        const detail = (await response.text()).trim()
        throw new Error(`MiniDSP returned ${response.status}${detail ? `: ${detail}` : ''}`)
      }
      const text = await response.text()
      return (text ? JSON.parse(text) : undefined) as T
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('MiniDSP daemon did not respond in time')
      }
      if (error instanceof TypeError) {
        throw new Error(
          `Cannot connect to MiniDSP daemon at ${this.baseUrl()}. Make sure minidspd is running.`
        )
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  async getStatus(): Promise<MiniDspStatus> {
    const devices = await this.request<DeviceSummary[]>('/devices', undefined, false)
    const device = devices[Math.max(0, Math.floor(this.config.deviceIndex))]
    if (!device) {
      return {
        connected: false,
        preset: 0,
        source: '',
        volumeDb: this.config.volumeMinDb,
        muted: false
      }
    }

    const response = await this.request<DeviceStatusResponse>()
    if (!response.master || typeof response.master.volume !== 'number') {
      throw new Error('MiniDSP returned an invalid device status')
    }
    return {
      connected: true,
      preset: Number(response.master.preset ?? 0),
      source: String(response.master.source ?? ''),
      volumeDb: response.master.volume,
      muted: Boolean(response.master.mute),
      productName: device.product_name ?? response.product_name
    }
  }

  async setVolume(volumeDb: number): Promise<void> {
    const volume = clamp(volumeDb, this.config.volumeMinDb, this.config.volumeMaxDb)
    await this.apply({ master_status: { volume } })
  }

  async setBassGain(gainDb: number): Promise<void> {
    const gain = clamp(gainDb, this.config.bassMinDb, this.config.bassMaxDb)
    const indexes = [...new Set(this.config.bassOutputChannels)]
      .filter((index) => Number.isInteger(index) && index >= 0)
      .map((index) => ({ index, gain }))
    if (indexes.length === 0) throw new Error('No MiniDSP bass output channels configured')
    await this.apply({ outputs: indexes })
  }

  async selectPreset(preset: number): Promise<void> {
    const allowed = this.config.presets.some((item) => item.index === preset)
    if (!allowed) throw new Error(`MiniDSP preset ${preset} is not configured`)
    await this.apply({ master_status: { preset } })
  }

  private async apply(patch: Record<string, unknown>): Promise<void> {
    await this.request('/config', { method: 'POST', body: JSON.stringify(patch) })
  }
}
