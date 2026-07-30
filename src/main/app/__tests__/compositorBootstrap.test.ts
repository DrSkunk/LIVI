import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { applyHostOutputMode } from '@main/app/hostOutput'
import { loadConfig } from '@main/config/loadConfig'
import type { Mock } from 'vitest'
import { bootstrapCompositor } from '../compositorBootstrap'

vi.mock('node:child_process', () => ({ spawn: vi.fn() }))
vi.mock('node:fs', () => {
  const __m = { existsSync: vi.fn() }
  return { ...__m, default: __m }
})
vi.mock('@main/config/loadConfig', () => ({ loadConfig: vi.fn(() => ({})) }))
vi.mock('@main/app/hostOutput', () => ({ applyHostOutputMode: vi.fn() }))

const mockedSpawn = spawn as Mock
const mockedExistsSync = existsSync as Mock
const mockedLoadConfig = loadConfig as Mock
const mockedApplyMode = applyHostOutputMode as Mock

describe('bootstrapCompositor', () => {
  const originalPlatform = process.platform
  const originalEnv = process.env
  const originalResourcesPath = process.resourcesPath

  const setPlatform = (value: string) => {
    Object.defineProperty(process, 'platform', { value, configurable: true })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockedSpawn.mockReturnValue({ unref: vi.fn() })
    mockedExistsSync.mockReturnValue(true)
    process.env = { ...originalEnv }
    delete process.env.LIVI_COMPOSITOR
    delete process.env.LIVI_NO_COMPOSITOR
    process.env.APPIMAGE = '/home/user/LIVI.AppImage'
    ;(process as { resourcesPath: string }).resourcesPath = '/opt/livi/resources'
    setPlatform('linux')
  })

  afterAll(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
    process.env = originalEnv
    ;(process as { resourcesPath?: string }).resourcesPath = originalResourcesPath
  })

  test('returns false and does not spawn on non-linux', () => {
    setPlatform('darwin')
    expect(bootstrapCompositor()).toBe(false)
    expect(mockedSpawn).not.toHaveBeenCalled()
  })

  test('returns false when already inside the compositor', () => {
    process.env.LIVI_COMPOSITOR = '1'
    expect(bootstrapCompositor()).toBe(false)
    expect(mockedSpawn).not.toHaveBeenCalled()
  })

  test('returns false when opted out', () => {
    process.env.LIVI_NO_COMPOSITOR = '1'
    expect(bootstrapCompositor()).toBe(false)
    expect(mockedSpawn).not.toHaveBeenCalled()
  })

  test('re-execs via process.execPath when not an AppImage (.deb)', () => {
    delete process.env.APPIMAGE
    expect(bootstrapCompositor()).toBe(true)
    const [, argv] = mockedSpawn.mock.calls[0]
    expect(argv[1]).toContain(process.execPath)
    expect(argv[1]).toContain('--ozone-platform=wayland')
  })

  test('returns false when the compositor launcher is missing', () => {
    mockedExistsSync.mockReturnValue(false)
    expect(bootstrapCompositor()).toBe(false)
    expect(mockedSpawn).not.toHaveBeenCalled()
  })

  test('spawns the compositor and re-execs the AppImage inside it', () => {
    expect(bootstrapCompositor()).toBe(true)

    expect(mockedSpawn).toHaveBeenCalledTimes(1)
    const [launcher, argv, opts] = mockedSpawn.mock.calls[0]
    expect(launcher).toBe('/opt/livi/resources/compositor/livi-compositor')
    expect(argv[0]).toBe('-s')
    expect(argv[1]).toContain('LIVI_COMPOSITOR=1')
    expect(argv[1]).toContain('/home/user/LIVI.AppImage')
    expect(argv[1]).toContain('--ozone-platform=wayland')
    expect(opts.detached).toBe(true)
    expect(opts.env.LIVI_OUTPUT_APP_ID).toBe('dev.f-io.livi')
    expect(opts.env.LIVI_SCREENS).toBe('main,dash,aux')
    expect(opts.env.APPIMAGE).toBeUndefined()
  })

  test('returns false without a resources path', () => {
    ;(process as { resourcesPath: string }).resourcesPath = ''
    expect(bootstrapCompositor()).toBe(false)
    expect(mockedSpawn).not.toHaveBeenCalled()
  })

  test('kiosk config applies the host display mode and an exact output size', () => {
    mockedLoadConfig.mockReturnValueOnce({
      mainScreenWidth: 800,
      mainScreenHeight: 480,
      kiosk: { main: true },
      displayMode: '800x480'
    })
    expect(bootstrapCompositor()).toBe(true)
    expect(mockedApplyMode).toHaveBeenCalledWith('800x480')
    const [, , opts] = mockedSpawn.mock.calls[0]
    expect(opts.env.LIVI_OUTPUT_SIZE).toBe('800x480')
  })

  test('windowed config adds the titlebar height and skips the mode switch', () => {
    process.env.LD_LIBRARY_PATH = '/opt/lib'
    process.env.XDG_RUNTIME_DIR = '/run/user/1000'
    mockedLoadConfig.mockReturnValueOnce({
      mainScreenWidth: 800,
      mainScreenHeight: 480,
      kiosk: { main: false }
    })
    expect(bootstrapCompositor()).toBe(true)
    expect(mockedApplyMode).not.toHaveBeenCalled()
    const [, argv, opts] = mockedSpawn.mock.calls[0]
    expect(argv[1]).toContain("LD_LIBRARY_PATH='/opt/lib'")
    expect(opts.env.LIVI_COMPOSITOR_CTRL).toBe('/run/user/1000/livi-compositor.ctrl')
    const size = opts.env.LIVI_OUTPUT_SIZE as string
    expect(size.startsWith('800x')).toBe(true)
    expect(Number(size.split('x')[1])).toBeGreaterThan(480)
  })

  test('LIVI_KIOSK=1 forces kiosk sizing without a kiosk config', () => {
    process.env.LIVI_KIOSK = '1'
    mockedLoadConfig.mockReturnValueOnce({
      mainScreenWidth: 1024,
      mainScreenHeight: 600,
      displayMode: '1024x600'
    })
    expect(bootstrapCompositor()).toBe(true)
    expect(mockedApplyMode).toHaveBeenCalledWith('1024x600')
    const [, , opts] = mockedSpawn.mock.calls[0]
    expect(opts.env.LIVI_OUTPUT_SIZE).toBe('1024x600')
  })

  test('invalid screen sizes leave the output size unset', () => {
    mockedLoadConfig.mockReturnValueOnce({ mainScreenWidth: 'x', mainScreenHeight: 480 })
    expect(bootstrapCompositor()).toBe(true)
    const [, , opts] = mockedSpawn.mock.calls[0]
    expect(opts.env.LIVI_OUTPUT_SIZE).toBeUndefined()
  })

  test('falls back to the compositor default when loadConfig throws', () => {
    mockedLoadConfig.mockImplementationOnce(() => {
      throw new Error('unreadable config')
    })
    expect(bootstrapCompositor()).toBe(true)
    const [, , opts] = mockedSpawn.mock.calls[0]
    expect(opts.env.LIVI_OUTPUT_SIZE).toBeUndefined()
  })
})
