import { configEvents } from '@main/ipc/utils'
import type { Mock } from 'vitest'
import { TelemetryStore } from '../TelemetryStore'
import { attachVolumePersist } from '../volumePersist'

vi.mock('@main/ipc/utils', () => ({
  configEvents: { emit: vi.fn() }
}))

const mockedEmit = configEvents.emit as Mock

let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  mockedEmit.mockReset()
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  logSpy.mockRestore()
})

describe('attachVolumePersist', () => {
  test('seeds the store with the clamped initial volume', () => {
    const store = new TelemetryStore()
    attachVolumePersist({ store, initialVolume: 1.5 })
    expect(store.snapshot().volume).toBe(1)
  })

  test('ignores a non-finite initial volume', () => {
    const store = new TelemetryStore()
    attachVolumePersist({ store, initialVolume: Number.NaN })
    expect(store.snapshot().volume).toBeUndefined()
  })

  test('persists telemetry volume changes as huVolume', () => {
    const store = new TelemetryStore()
    attachVolumePersist({ store, initialVolume: 0.2 })
    store.merge({ volume: 0.8 })
    expect(mockedEmit).toHaveBeenCalledWith('requestSave', { huVolume: 0.8 })
    expect(logSpy).toHaveBeenCalledWith('[volume] head unit set to 80 % from telemetry')
  })

  test('persists the first change when no initial volume exists', () => {
    const store = new TelemetryStore()
    attachVolumePersist({ store })
    store.merge({ volume: -0.5 })
    expect(mockedEmit).toHaveBeenCalledWith('requestSave', { huVolume: 0 })
  })

  test('drops rounding noise below the minimum delta', () => {
    const store = new TelemetryStore()
    attachVolumePersist({ store, initialVolume: 0.5 })
    store.merge({ volume: 0.5004 })
    expect(mockedEmit).not.toHaveBeenCalled()
  })

  test('ignores patches without a volume', () => {
    const store = new TelemetryStore()
    attachVolumePersist({ store, initialVolume: 0.5 })
    store.merge({ speedKph: 100 })
    expect(mockedEmit).not.toHaveBeenCalled()
  })

  test('ignores non-numeric volume values', () => {
    const store = new TelemetryStore()
    attachVolumePersist({ store })
    store.merge({ volume: Number.POSITIVE_INFINITY })
    expect(mockedEmit).not.toHaveBeenCalled()
  })

  test('keeps running when requestSave throws', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockedEmit.mockImplementation(() => {
      throw new Error('no listener')
    })
    const store = new TelemetryStore()
    attachVolumePersist({ store })
    expect(() => store.merge({ volume: 0.7 })).not.toThrow()
    expect(warnSpy).toHaveBeenCalledWith('[volume] requestSave failed (ignored)', expect.any(Error))
    warnSpy.mockRestore()
  })

  test('off detaches from the store', () => {
    const store = new TelemetryStore()
    const handle = attachVolumePersist({ store, initialVolume: 0.1 })
    handle.off()
    store.merge({ volume: 0.9 })
    expect(mockedEmit).not.toHaveBeenCalled()
  })
})
