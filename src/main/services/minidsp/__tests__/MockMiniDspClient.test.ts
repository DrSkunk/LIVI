import { DEFAULT_CONFIG } from '@shared/types'
import { MockMiniDspClient } from '../MockMiniDspClient'

const config = () => ({ ...DEFAULT_CONFIG.minidsp, mockDevice: true })

describe('MockMiniDspClient', () => {
  test('simulates status and control changes in memory', async () => {
    const client = new MockMiniDspClient(config())

    await expect(client.getStatus()).resolves.toEqual({
      connected: true,
      preset: 0,
      source: 'Mock source',
      volumeDb: -18,
      muted: false,
      productName: 'Mock MiniDSP'
    })

    await client.setVolume(-24.5)
    await client.selectPreset(2)

    await expect(client.getStatus()).resolves.toEqual(
      expect.objectContaining({ volumeDb: -24.5, preset: 2 })
    )
  })

  test('clamps volume and rejects unknown presets', async () => {
    const client = new MockMiniDspClient(config())

    await client.setVolume(50)
    await expect(client.getStatus()).resolves.toEqual(expect.objectContaining({ volumeDb: 0 }))
    await expect(client.selectPreset(99)).rejects.toThrow('preset 99 is not configured')
  })
})
