import type { AaSession } from '@projection/driver/aa/AaSession'
import { isWired } from '@shared/types/Telemetry'
import type { Mock } from 'vitest'
import { TelemetryStore } from '../../TelemetryStore'
import { attachAaAdapter, mapGearToAa } from '../aaAdapter'

vi.mock('@shared/types/Telemetry', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@shared/types/Telemetry')>()
  return { ...orig, isWired: vi.fn(orig.isWired) }
})

const mockedIsWired = isWired as unknown as Mock

let realIsWired: typeof isWired

beforeAll(async () => {
  const orig =
    await vi.importActual<typeof import('@shared/types/Telemetry')>('@shared/types/Telemetry')
  realIsWired = orig.isWired
})

afterEach(() => {
  mockedIsWired.mockImplementation(realIsWired)
})

function fakeDriver() {
  return {
    sendSpeedData: vi.fn(),
    sendRpmData: vi.fn(),
    sendGearData: vi.fn(),
    sendNightModeData: vi.fn(),
    sendParkingBrakeData: vi.fn(),
    sendDrivingStatusData: vi.fn(),
    sendLightData: vi.fn(),
    sendFuelData: vi.fn(),
    sendOdometerData: vi.fn(),
    sendEnvironmentData: vi.fn(),
    sendGpsLocationData: vi.fn(),
    sendVehicleEnergyModel: vi.fn()
  }
}

function setup() {
  const store = new TelemetryStore()
  const driver = fakeDriver()
  const handle = attachAaAdapter({
    store,
    getAaDriver: () => driver as unknown as AaSession
  })
  return { store, driver, handle }
}

describe('mapGearToAa', () => {
  test('numeric reverse → 102', () => {
    expect(mapGearToAa(-1, false)).toBe(102)
  })
  test('numeric neutral / drive range', () => {
    expect(mapGearToAa(0, false)).toBe(0)
    expect(mapGearToAa(3, false)).toBe(3)
  })
  test('string P/R/N/D/S', () => {
    expect(mapGearToAa('P', false)).toBe(101)
    expect(mapGearToAa('R', false)).toBe(102)
    expect(mapGearToAa('N', false)).toBe(0)
    expect(mapGearToAa('D', false)).toBe(100)
    expect(mapGearToAa('S', false)).toBe(100)
  })
  test('string M1..M10', () => {
    expect(mapGearToAa('M1', false)).toBe(1)
    expect(mapGearToAa('M10', false)).toBe(10)
  })
  test('reverseFlag alone yields 102', () => {
    expect(mapGearToAa(undefined, true)).toBe(102)
  })
  test('out-of-range numeric and manual gears → undefined', () => {
    expect(mapGearToAa(11, undefined)).toBeUndefined()
    expect(mapGearToAa(-2, undefined)).toBeUndefined()
    expect(mapGearToAa('M11', undefined)).toBeUndefined()
    expect(mapGearToAa('M0', undefined)).toBeUndefined()
  })

  test('unknown / undefined → undefined', () => {
    expect(mapGearToAa(undefined, undefined)).toBeUndefined()
    expect(mapGearToAa('X', undefined)).toBeUndefined()
  })
})

describe('aaAdapter — single-field forwarders', () => {
  test('speedKph → sendSpeedData in mm/s', () => {
    const { store, driver } = setup()
    store.merge({ speedKph: 36 }) // 10 m/s → 10000 mm/s
    expect(driver.sendSpeedData).toHaveBeenCalledWith(10_000)
  })

  test('idempotent: same speed twice fires only once', () => {
    const { store, driver } = setup()
    store.merge({ speedKph: 36 })
    store.merge({ speedKph: 36 })
    expect(driver.sendSpeedData).toHaveBeenCalledTimes(1)
  })

  test('rpm → sendRpmData × 1000', () => {
    const { store, driver } = setup()
    store.merge({ rpm: 2500 })
    expect(driver.sendRpmData).toHaveBeenCalledWith(2_500_000)
  })

  test('nightMode boolean forwards', () => {
    const { store, driver } = setup()
    store.merge({ nightMode: true })
    expect(driver.sendNightModeData).toHaveBeenCalledWith(true)
  })

  test('parkingBrake boolean forwards', () => {
    const { store, driver } = setup()
    store.merge({ parkingBrake: true })
    expect(driver.sendParkingBrakeData).toHaveBeenCalledWith(true)
  })

  test('drivingStatus integer forwards', () => {
    const { store, driver } = setup()
    store.merge({ drivingStatus: 3 })
    expect(driver.sendDrivingStatusData).toHaveBeenCalledWith(3)
  })

  test('gear → mapGearToAa → sendGearData', () => {
    const { store, driver } = setup()
    store.merge({ gear: 'D' })
    expect(driver.sendGearData).toHaveBeenCalledWith(100)
  })
})

describe('aaAdapter — bundled fields', () => {
  test('lights/highBeam/turn/hazards → one sendLightData call', () => {
    const { store, driver } = setup()
    store.merge({ highBeam: true, turn: 'left', hazards: false })
    expect(driver.sendLightData).toHaveBeenCalledWith(3, false, 2)
  })

  test('lights=true (no high beam) → head=2', () => {
    const { store, driver } = setup()
    store.merge({ lights: true, turn: 'right', hazards: true })
    expect(driver.sendLightData).toHaveBeenCalledWith(2, true, 3)
  })

  test('lights=false → head=1', () => {
    const { store, driver } = setup()
    store.merge({ lights: false, turn: 'none' })
    expect(driver.sendLightData).toHaveBeenCalledWith(1, undefined, 1)
  })

  test('fuelPct + rangeKm → sendFuelData (clamped to 0..100, m, lowFuel bool)', () => {
    const { store, driver } = setup()
    store.merge({ fuelPct: 5, rangeKm: 100 })
    expect(driver.sendFuelData).toHaveBeenCalledWith(5, 100_000, true)
  })

  test('fuelPct >= 10 → lowFuel=false', () => {
    const { store, driver } = setup()
    store.merge({ fuelPct: 50, rangeKm: 400 })
    expect(driver.sendFuelData).toHaveBeenCalledWith(50, 400_000, false)
  })

  test('fuelPct > 100 is clamped to 100', () => {
    const { store, driver } = setup()
    store.merge({ fuelPct: 150 })
    expect(driver.sendFuelData).toHaveBeenCalledWith(100, undefined, false)
  })

  test('odometerKm × 10 + tripKm × 10', () => {
    const { store, driver } = setup()
    store.merge({ odometerKm: 12_345.6, odometerTripKm: 12.3 })
    expect(driver.sendOdometerData).toHaveBeenCalledWith(123_456, 123)
  })

  test('ambientC + baroKpa → sendEnvironmentData', () => {
    const { store, driver } = setup()
    store.merge({ ambientC: 22.5, baroKpa: 101.3 })
    expect(driver.sendEnvironmentData).toHaveBeenCalledWith(22_500, 101_300)
  })

  test('gps fix with full payload forwards each field', () => {
    const { store, driver } = setup()
    store.merge({
      gps: { lat: 52.5, lng: 13.4, accuracyM: 5, alt: 100, speedMs: 10, heading: 90 }
    })
    expect(driver.sendGpsLocationData).toHaveBeenCalledWith({
      latDeg: 52.5,
      lngDeg: 13.4,
      accuracyM: 5,
      altitudeM: 100,
      speedMs: 10,
      bearingDeg: 90
    })
  })

  test('gps without lat/lng is ignored', () => {
    const { store, driver } = setup()
    store.merge({ gps: { lat: 52.5 } })
    expect(driver.sendGpsLocationData).not.toHaveBeenCalled()
  })

  test('vehicle energy model is sent when capacity + range present', () => {
    const { store, driver } = setup()
    store.merge({ batteryCapacityKwh: 50, rangeKm: 200, batteryLevelKwh: 30 })
    expect(driver.sendVehicleEnergyModel).toHaveBeenCalled()
  })

  test('VEM is throttled (10s)', () => {
    const { store, driver } = setup()
    store.merge({ batteryCapacityKwh: 50, rangeKm: 200, batteryLevelKwh: 30 })
    store.merge({ batteryCapacityKwh: 50, rangeKm: 199, batteryLevelKwh: 30 })
    expect(driver.sendVehicleEnergyModel).toHaveBeenCalledTimes(1)
  })

  test('VEM is skipped when range is 0', () => {
    const { store, driver } = setup()
    store.merge({ batteryCapacityKwh: 50, rangeKm: 0, batteryLevelKwh: 30 })
    expect(driver.sendVehicleEnergyModel).not.toHaveBeenCalled()
  })
})

describe('aaAdapter — bundle edge cases', () => {
  test('turn right, none and unknown map to 3, 1 and undefined', () => {
    const { store, driver } = setup()
    store.merge({ turn: 'right' })
    expect(driver.sendLightData).toHaveBeenLastCalledWith(undefined, undefined, 3)
    store.merge({ turn: 'none' })
    expect(driver.sendLightData).toHaveBeenLastCalledWith(undefined, undefined, 1)
    store.merge({ turn: 'wat' as never })
    expect(driver.sendLightData).toHaveBeenLastCalledWith(undefined, undefined, undefined)
  })

  test('an unchanged light bundle is not resent', () => {
    const { store, driver } = setup()
    store.merge({ lights: true, hazards: true })
    store.merge({ lights: true, hazards: true, turn: undefined as never })
    expect(driver.sendLightData).toHaveBeenCalledTimes(1)
  })

  test('a hazards-only change resends the bundle', () => {
    const { store, driver } = setup()
    store.merge({ lights: true })
    store.merge({ hazards: true })
    expect(driver.sendLightData).toHaveBeenCalledTimes(2)
    expect(driver.sendLightData).toHaveBeenLastCalledWith(2, true, undefined)
  })

  test('a turn-only change resends the bundle', () => {
    const { store, driver } = setup()
    store.merge({ lights: true })
    store.merge({ turn: 'left' })
    expect(driver.sendLightData).toHaveBeenCalledTimes(2)
    expect(driver.sendLightData).toHaveBeenLastCalledWith(2, undefined, 2)
  })

  test('fuel without a level is not sent', () => {
    const { store, driver } = setup()
    store.merge({ rangeKm: 400 })
    expect(driver.sendFuelData).not.toHaveBeenCalled()
  })

  test('an unchanged fuel bundle is not resent', () => {
    const { store, driver } = setup()
    store.merge({ fuelPct: 50 })
    store.merge({ fuelPct: 50.2 })
    expect(driver.sendFuelData).toHaveBeenCalledTimes(1)
  })

  test('a range-only change resends the fuel bundle', () => {
    const { store, driver } = setup()
    store.merge({ fuelPct: 50, rangeKm: 400 })
    store.merge({ rangeKm: 410 })
    expect(driver.sendFuelData).toHaveBeenCalledTimes(2)
    expect(driver.sendFuelData).toHaveBeenLastCalledWith(50, 410000, false)
  })

  test('a lowFuel-only flip resends the fuel bundle', () => {
    const { store, driver } = setup()
    store.merge({ fuelPct: 9.6 })
    store.merge({ fuelPct: 10.4 })
    expect(driver.sendFuelData).toHaveBeenCalledTimes(2)
    expect(driver.sendFuelData).toHaveBeenLastCalledWith(10, undefined, false)
  })

  test('fuel keys can be unwired individually', () => {
    const { store, driver } = setup()
    mockedIsWired.mockImplementation((_r: string, key: string) => key === 'rangeKm')
    store.merge({ fuelPct: 50 })
    expect(driver.sendFuelData).toHaveBeenCalledTimes(1)
    mockedIsWired.mockImplementation(() => false)
    store.merge({ fuelPct: 60 })
    expect(driver.sendFuelData).toHaveBeenCalledTimes(1)
  })

  test('odometer without a total is not sent', () => {
    const { store, driver } = setup()
    store.merge({ odometerTripKm: 12.3 })
    expect(driver.sendOdometerData).not.toHaveBeenCalled()
  })

  test('an unchanged odometer is not resent, a trip-only change is', () => {
    const { store, driver } = setup()
    store.merge({ odometerKm: 100 })
    store.merge({ odometerKm: 100.01 })
    expect(driver.sendOdometerData).toHaveBeenCalledTimes(1)
    store.merge({ odometerTripKm: 5 })
    expect(driver.sendOdometerData).toHaveBeenCalledTimes(2)
    expect(driver.sendOdometerData).toHaveBeenLastCalledWith(1000, 50)
  })

  test('an unchanged environment bundle is not resent', () => {
    const { store, driver } = setup()
    store.merge({ ambientC: 20 })
    store.merge({ ambientC: 20.0001 })
    expect(driver.sendEnvironmentData).toHaveBeenCalledTimes(1)
  })

  test('a pressure-only change resends the environment bundle', () => {
    const { store, driver } = setup()
    store.merge({ ambientC: 20 })
    store.merge({ baroKpa: 101.3 })
    expect(driver.sendEnvironmentData).toHaveBeenCalledTimes(2)
    expect(driver.sendEnvironmentData).toHaveBeenLastCalledWith(20000, 101300)
  })

  test('an unchanged gps fix is not resent', () => {
    const { store, driver } = setup()
    const fix = { lat: 52, lng: 13, alt: 30, speedMs: 5, heading: 90, accuracyM: 3 }
    store.merge({ gps: fix })
    store.merge({ gps: { ...fix } })
    expect(driver.sendGpsLocationData).toHaveBeenCalledTimes(1)
  })

  test.each([
    ['accuracyM', { accuracyM: 4 }],
    ['alt', { alt: 31 }],
    ['speedMs', { speedMs: 6 }],
    ['heading', { heading: 91 }],
    ['lng', { lng: 13.1 }]
  ])('a %s-only gps change resends the fix', (_key, delta) => {
    const { store, driver } = setup()
    store.merge({ gps: { lat: 52, lng: 13, alt: 30, speedMs: 5, heading: 90, accuracyM: 3 } })
    store.merge({ gps: delta })
    expect(driver.sendGpsLocationData).toHaveBeenCalledTimes(2)
  })

  test('a gps fix with a non-numeric lat or lng is dropped', () => {
    const { store, driver } = setup()
    store.merge({ gps: { lat: 'x' as never, lng: 13 } })
    store.merge({ gps: { lat: 52, lng: 'y' as never } })
    expect(driver.sendGpsLocationData).not.toHaveBeenCalled()
  })

  test('VEM derives the charge from batteryLevelKwh first, then fuelPct', () => {
    const { store, driver } = setup()
    store.merge({ batteryCapacityKwh: 60, batteryLevelKwh: 30, rangeKm: 200 })
    expect(driver.sendVehicleEnergyModel).toHaveBeenLastCalledWith(60000, 30000, 200000)

    const second = setup()
    second.store.merge({ batteryCapacityKwh: 60, fuelPct: 50, rangeKm: 200 })
    expect(second.driver.sendVehicleEnergyModel).toHaveBeenLastCalledWith(60000, 30000, 200000)
  })

  test('VEM is skipped without any charge information or capacity', () => {
    const { store, driver } = setup()
    store.merge({ batteryCapacityKwh: 60, rangeKm: 200 })
    expect(driver.sendVehicleEnergyModel).not.toHaveBeenCalled()

    const second = setup()
    second.store.merge({ batteryCapacityKwh: 0, batteryLevelKwh: 30, rangeKm: 200 })
    expect(second.driver.sendVehicleEnergyModel).not.toHaveBeenCalled()
  })

  test('single-field forwarders are idempotent', () => {
    const { store, driver } = setup()
    store.merge({ rpm: 3 })
    store.merge({ rpm: 3, speedKph: 1 })
    expect(driver.sendRpmData).toHaveBeenCalledTimes(1)
    store.merge({ nightMode: true })
    store.merge({ nightMode: true, speedKph: 2 })
    expect(driver.sendNightModeData).toHaveBeenCalledTimes(1)
    store.merge({ parkingBrake: true })
    store.merge({ parkingBrake: true, speedKph: 3 })
    expect(driver.sendParkingBrakeData).toHaveBeenCalledTimes(1)
    store.merge({ drivingStatus: 2 })
    store.merge({ drivingStatus: 2, speedKph: 4 })
    expect(driver.sendDrivingStatusData).toHaveBeenCalledTimes(1)
    store.merge({ gear: 'D' })
    store.merge({ gear: 'D', speedKph: 5 })
    expect(driver.sendGearData).toHaveBeenCalledTimes(1)
  })

  test('environment stays wired through baroKpa alone', () => {
    const { store, driver } = setup()
    mockedIsWired.mockImplementation((_r: string, key: string) => key === 'baroKpa')
    store.merge({ baroKpa: 101.3 })
    expect(driver.sendEnvironmentData).toHaveBeenCalledWith(undefined, 101300)
  })

  test('a gps patch without a snapshot fix is ignored', () => {
    const { store, driver } = setup()
    store.emit('change', { gps: undefined }, {})
    expect(driver.sendGpsLocationData).not.toHaveBeenCalled()
  })

  test('VEM resends after the throttle interval', () => {
    vi.useFakeTimers()
    try {
      const { store, driver } = setup()
      store.merge({ batteryCapacityKwh: 60, batteryLevelKwh: 30, rangeKm: 200 })
      vi.advanceTimersByTime(11_000)
      store.merge({ rangeKm: 190 })
      expect(driver.sendVehicleEnergyModel).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('aaAdapter — driver-not-active path', () => {
  test('no calls when getAaDriver returns null', () => {
    const store = new TelemetryStore()
    const driver = fakeDriver()
    attachAaAdapter({ store, getAaDriver: () => null })
    store.merge({ speedKph: 50 })
    expect(driver.sendSpeedData).not.toHaveBeenCalled()
  })
})

describe('aaAdapter — handle', () => {
  test('off detaches the listener', () => {
    const { store, driver, handle } = setup()
    handle.off()
    store.merge({ speedKph: 50 })
    expect(driver.sendSpeedData).not.toHaveBeenCalled()
  })

  test('hydrate replays the current snapshot to a fresh subscription', () => {
    const { store, driver, handle } = setup()
    store.merge({ speedKph: 36 })
    driver.sendSpeedData.mockClear()
    handle.hydrate()
    expect(driver.sendSpeedData).toHaveBeenCalledWith(10_000)
  })

  test('hydrate on an empty store is a no-op', () => {
    const { driver, handle } = setup()
    handle.hydrate()
    expect(driver.sendSpeedData).not.toHaveBeenCalled()
  })
})
