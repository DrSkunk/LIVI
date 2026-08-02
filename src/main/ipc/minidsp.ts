import { registerIpcHandle } from '@main/ipc/register'
import { MiniDspClient, type MiniDspController } from '@main/services/minidsp/MiniDspClient'
import { MockMiniDspClient } from '@main/services/minidsp/MockMiniDspClient'
import type { runtimeStateProps } from '@main/types'
import { app } from 'electron'

const finite = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`)
  }
  return value
}

export function registerMiniDspIpc(runtimeState: runtimeStateProps): void {
  let mockClient: MockMiniDspClient | null = null

  const client = (): MiniDspController => {
    const config = runtimeState.config.minidsp
    if (!config.enabled) throw new Error('MiniDSP screen is disabled')

    const mockRequested = config.mockDevice || process.env.LIVI_MOCK_MINIDSP === '1'
    if (mockRequested) {
      if (app.isPackaged) throw new Error('Mock MiniDSP is available only in development builds')
      mockClient ??= new MockMiniDspClient(config)
      return mockClient
    }

    mockClient = null
    return new MiniDspClient(config)
  }

  registerIpcHandle('minidsp:status', () => client().getStatus())
  registerIpcHandle('minidsp:set-volume', (_event, value: unknown) =>
    client().setVolume(finite(value, 'Volume'))
  )
  registerIpcHandle('minidsp:set-bass', (_event, value: unknown) =>
    client().setBassGain(finite(value, 'Bass gain'))
  )
  registerIpcHandle('minidsp:select-preset', (_event, value: unknown) =>
    client().selectPreset(finite(value, 'Preset'))
  )
}
