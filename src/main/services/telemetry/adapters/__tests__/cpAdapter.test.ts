import { isWired } from '@shared/types/Telemetry'
import type { Mock } from 'vitest'
import { encodeNmea } from '../../nmea'
import { TelemetryStore } from '../../TelemetryStore'
import { attachCpAdapter, type CpTelemetrySink } from '../cpAdapter'

vi.mock('../../nmea', () => ({
  encodeNmea: vi.fn(() => '$GPRMC,fake')
}))

vi.mock('@shared/types/Telemetry', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@shared/types/Telemetry')>()
  return { ...orig, isWired: vi.fn(orig.isWired) }
})

const mockedNmea = encodeNmea as Mock
const mockedIsWired = isWired as unknown as Mock

function sink(): CpTelemetrySink & { [K in keyof CpTelemetrySink]: Mock } {
  return {
    sendNightMode: vi.fn(),
    sendVehicleStatus: vi.fn(),
    sendLocation: vi.fn()
  }
}

beforeEach(() => {
  mockedNmea.mockClear()
  mockedNmea.mockReturnValue('$GPRMC,fake')
  mockedIsWired.mockReset()
  mockedIsWired.mockImplementation(() => true)
})

describe('attachCpAdapter', () => {
  test('does nothing while no CarPlay driver is connected', () => {
    const store = new TelemetryStore()
    const cp = sink()
    attachCpAdapter({ store, getCpDriver: () => null })
    store.merge({ nightMode: true })
    expect(cp.sendNightMode).not.toHaveBeenCalled()
  })

  test('forwards night mode changes once per value', () => {
    const store = new TelemetryStore()
    const cp = sink()
    attachCpAdapter({ store, getCpDriver: () => cp })

    store.merge({ nightMode: true })
    store.merge({ nightMode: true, speedKph: 10 })
    store.merge({ nightMode: false })

    expect(cp.sendNightMode.mock.calls).toEqual([[true], [false]])
  })

  test('ignores non-boolean night mode values', () => {
    const store = new TelemetryStore()
    const cp = sink()
    attachCpAdapter({ store, getCpDriver: () => cp })
    store.merge({ nightMode: 'dark' as never })
    expect(cp.sendNightMode).not.toHaveBeenCalled()
  })

  test('pushes range and outside temperature rounded and clamped', () => {
    const store = new TelemetryStore()
    const cp = sink()
    attachCpAdapter({ store, getCpDriver: () => cp })

    store.merge({ rangeKm: 123456.7 })
    expect(cp.sendVehicleStatus).toHaveBeenLastCalledWith({ range: 65535 })

    store.merge({ ambientC: 21.6 })
    expect(cp.sendVehicleStatus).toHaveBeenLastCalledWith({ range: 65535, outsideTemperature: 22 })
  })

  test('skips the vehicle status push when no numeric values exist', () => {
    const store = new TelemetryStore()
    const cp = sink()
    attachCpAdapter({ store, getCpDriver: () => cp })
    store.merge({ rangeKm: 'unknown' as never })
    expect(cp.sendVehicleStatus).not.toHaveBeenCalled()
  })

  test('sends NMEA for gps patches with a fix', () => {
    const store = new TelemetryStore()
    const cp = sink()
    attachCpAdapter({ store, getCpDriver: () => cp })

    store.merge({ gps: { lat: 52.5, lng: 13.4, alt: 30, heading: 90, speedMs: 5 } })
    expect(mockedNmea).toHaveBeenCalledWith(52.5, 13.4, 30, 90, 5, undefined, undefined)
    expect(cp.sendLocation).toHaveBeenCalledWith('$GPRMC,fake')
  })

  test('drops gps patches without a full position', () => {
    const store = new TelemetryStore()
    const cp = sink()
    attachCpAdapter({ store, getCpDriver: () => cp })

    store.merge({ gps: { lat: 52.5 } })
    expect(cp.sendLocation).not.toHaveBeenCalled()
  })

  test('sends nothing when the wiring table disables the keys', () => {
    mockedIsWired.mockImplementation(() => false)
    const store = new TelemetryStore()
    const cp = sink()
    attachCpAdapter({ store, getCpDriver: () => cp })

    store.merge({ nightMode: true, rangeKm: 100, ambientC: 20, gps: { lat: 1, lng: 2 } })
    expect(cp.sendNightMode).not.toHaveBeenCalled()
    expect(cp.sendVehicleStatus).not.toHaveBeenCalled()
    expect(cp.sendLocation).not.toHaveBeenCalled()
  })

  test('hydrate replays the current snapshot to a fresh driver', () => {
    const store = new TelemetryStore()
    const cp = sink()
    const handle = attachCpAdapter({ store, getCpDriver: () => cp })

    store.merge({ nightMode: true })
    cp.sendNightMode.mockClear()

    handle.hydrate()
    expect(cp.sendNightMode).toHaveBeenCalledWith(true)
  })

  test('hydrate with an empty store is a no-op', () => {
    const store = new TelemetryStore()
    const cp = sink()
    const handle = attachCpAdapter({ store, getCpDriver: () => cp })
    handle.hydrate()
    expect(cp.sendNightMode).not.toHaveBeenCalled()
  })

  test('off detaches from the store', () => {
    const store = new TelemetryStore()
    const cp = sink()
    const handle = attachCpAdapter({ store, getCpDriver: () => cp })
    handle.off()
    store.merge({ nightMode: true })
    expect(cp.sendNightMode).not.toHaveBeenCalled()
  })
})
