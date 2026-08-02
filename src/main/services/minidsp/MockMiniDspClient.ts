import type { MiniDspConfig, MiniDspStatus } from '@shared/types'
import type { MiniDspController } from './MiniDspClient'

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

/** In-memory MiniDSP used only by development builds. */
export class MockMiniDspClient implements MiniDspController {
  private volumeDb: number
  private bassGainDb: number
  private preset: number

  constructor(private readonly config: MiniDspConfig) {
    this.volumeDb = clamp(-18, config.volumeMinDb, config.volumeMaxDb)
    this.bassGainDb = clamp(config.bassGainDb, config.bassMinDb, config.bassMaxDb)
    this.preset = config.presets[0]?.index ?? 0
  }

  async getStatus(): Promise<MiniDspStatus> {
    return {
      connected: true,
      preset: this.preset,
      source: 'Mock source',
      volumeDb: this.volumeDb,
      muted: false,
      productName: 'Mock MiniDSP'
    }
  }

  async setVolume(volumeDb: number): Promise<void> {
    this.volumeDb = clamp(volumeDb, this.config.volumeMinDb, this.config.volumeMaxDb)
  }

  async setBassGain(gainDb: number): Promise<void> {
    this.bassGainDb = clamp(gainDb, this.config.bassMinDb, this.config.bassMaxDb)
  }

  async selectPreset(preset: number): Promise<void> {
    if (!this.config.presets.some((item) => item.index === preset)) {
      throw new Error(`MiniDSP preset ${preset} is not configured`)
    }
    this.preset = preset
  }
}
