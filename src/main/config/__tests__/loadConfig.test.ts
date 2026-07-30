import { hostname } from 'node:os'
import { loadConfig } from '@main/config/loadConfig'
import { CAR_NAME_MAX, WIFI_PASSWORD_MAX } from '@shared/types/Config'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import type { Mock } from 'vitest'

vi.mock('fs', () => {
  const __m = {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn()
  }
  return { ...__m, default: __m }
})

vi.mock('@main/config/paths', () => ({
  CONFIG_PATH: '/tmp/config.json'
}))

vi.mock('node:os', () => ({ hostname: vi.fn(() => 'test-host') }))

vi.mock('@shared/types', () => ({
  DEFAULT_CONFIG: {
    width: 800,
    height: 480,
    kiosk: true,
    carName: 'LIVI',
    bindings: {},
    wifiPassword: 'livi-default-pw'
  }
}))

describe('loadConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('returns defaults and writes config when file does not exist', () => {
    ;(existsSync as Mock).mockReturnValue(false)

    const result = loadConfig()

    expect(result).toEqual({
      width: 800,
      height: 480,
      kiosk: true,
      carName: 'test-host',
      bindings: {},
      wifiPassword: 'livi-default-pw'
    })
    expect(writeFileSync).toHaveBeenCalledWith('/tmp/config.json', JSON.stringify(result, null, 2))
  })

  test('reads and returns merged config from file', () => {
    ;(existsSync as Mock).mockReturnValue(true)
    ;(readFileSync as Mock).mockReturnValue(
      JSON.stringify({
        width: 1024,
        height: 600,
        kiosk: false,
        carName: 'MyCar',
        bindings: {},
        wifiPassword: 'MyCarPass123'
      })
    )

    const result = loadConfig()

    expect(readFileSync).toHaveBeenCalledWith('/tmp/config.json', 'utf8')
    expect(result).toEqual({
      width: 1024,
      height: 600,
      kiosk: false,
      carName: 'MyCar',
      bindings: {},
      wifiPassword: 'MyCarPass123'
    })
    expect(writeFileSync).not.toHaveBeenCalled()
  })

  test('falls back to defaults and rewrites file when json is invalid', () => {
    ;(existsSync as Mock).mockReturnValue(true)
    ;(readFileSync as Mock).mockReturnValue('{bad-json')

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const result = loadConfig()

    expect(result).toEqual({
      width: 800,
      height: 480,
      kiosk: true,
      carName: 'test-host',
      bindings: {},
      wifiPassword: 'livi-default-pw'
    })
    expect(warnSpy).toHaveBeenCalled()
    expect(writeFileSync).toHaveBeenCalledWith('/tmp/config.json', JSON.stringify(result, null, 2))

    warnSpy.mockRestore()
  })

  test('an existing carName is never replaced by the hostname', () => {
    ;(existsSync as Mock).mockReturnValue(true)
    ;(readFileSync as Mock).mockReturnValue(
      JSON.stringify({
        width: 800,
        height: 480,
        kiosk: true,
        carName: 'Wohnmobil',
        bindings: {},
        wifiPassword: 'MyCarPass123'
      })
    )

    const result = loadConfig()

    expect(result.carName).toBe('Wohnmobil')
    expect(writeFileSync).not.toHaveBeenCalled()
  })

  test('an empty carName is kept, only a missing one is derived', () => {
    ;(existsSync as Mock).mockReturnValue(true)
    ;(readFileSync as Mock).mockReturnValue(
      JSON.stringify({ width: 800, height: 480, kiosk: true, carName: '', bindings: {} })
    )

    expect(loadConfig().carName).toBe('')
  })

  test('a localhost hostname falls back to the default car name', () => {
    ;(existsSync as Mock).mockReturnValue(false)
    ;(hostname as Mock).mockReturnValueOnce('LocalHost.localdomain')
    expect(loadConfig().carName).toBe('LIVI')
  })

  test('an empty hostname falls back to the default car name', () => {
    ;(existsSync as Mock).mockReturnValue(false)
    ;(hostname as Mock).mockReturnValueOnce('')
    expect(loadConfig().carName).toBe('LIVI')
  })

  test('a long hostname is truncated to the car name limit', () => {
    ;(existsSync as Mock).mockReturnValue(false)
    ;(hostname as Mock).mockReturnValueOnce('x'.repeat(CAR_NAME_MAX + 10))
    expect(loadConfig().carName).toBe('x'.repeat(CAR_NAME_MAX))
  })

  test('a valid wifiPassword survives', () => {
    ;(existsSync as Mock).mockReturnValue(true)
    ;(readFileSync as Mock).mockReturnValue(
      JSON.stringify({
        width: 800,
        height: 480,
        kiosk: true,
        carName: 'Car',
        bindings: {},
        wifiPassword: 'supersecret'
      })
    )
    expect(loadConfig().wifiPassword).toBe('supersecret')
  })

  test('an overlong wifiPassword falls back to the default', () => {
    ;(existsSync as Mock).mockReturnValue(true)
    ;(readFileSync as Mock).mockReturnValue(
      JSON.stringify({
        width: 800,
        height: 480,
        kiosk: true,
        carName: 'Car',
        bindings: {},
        wifiPassword: 'p'.repeat(WIFI_PASSWORD_MAX + 1)
      })
    )
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(loadConfig().wifiPassword).toBe('livi-default-pw')
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('falling back'))
    warnSpy.mockRestore()
  })
})
