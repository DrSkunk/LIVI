import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import type { Mock } from 'vitest'
import {
  listBtAdapters,
  listWifiChannels,
  listWifiCountryCodes,
  listWifiInterfaces
} from '../wifiOptions'

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }))
vi.mock('node:fs', () => {
  const __m = { existsSync: vi.fn(), readdirSync: vi.fn() }
  return { ...__m, default: __m }
})

const mockedExec = execFileSync as Mock
const mockedExists = existsSync as Mock
const mockedReaddir = readdirSync as Mock

const IW_LIST = [
  'Wiphy phy0',
  '  Frequencies:',
  '    * 2412.0 MHz [1]',
  '    * 2417 MHz [2]',
  '    * 2484 MHz [14]',
  '    * 5180.0 MHz [36]',
  '    * 5200 MHz [40] (disabled)',
  '    * 5260 MHz [52] (radar detection)',
  '    * 5745 MHz [149]',
  '    * 5955 MHz [1] 6GHz-band',
  '    * bogus line',
  ''
].join('\n')

describe('wifiOptions', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  })

  describe('listWifiInterfaces', () => {
    test('returns sorted net devices with a wireless sysfs dir', () => {
      mockedReaddir.mockReturnValue(['wlan1', 'eth0', 'wlan0'])
      mockedExists.mockImplementation((p: string) => String(p).includes('wlan'))
      expect(listWifiInterfaces()).toEqual(['wlan0', 'wlan1'])
    })

    test('returns [] off linux', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
      expect(listWifiInterfaces()).toEqual([])
      expect(mockedReaddir).not.toHaveBeenCalled()
    })

    test('returns [] when sysfs is unreadable', () => {
      mockedReaddir.mockImplementation(() => {
        throw new Error('ENOENT')
      })
      expect(listWifiInterfaces()).toEqual([])
    })
  })

  describe('listBtAdapters', () => {
    test('returns sorted hciN adapters', () => {
      mockedReaddir.mockReturnValue(['hci1', 'hci0', 'usb1', 'hciX'])
      expect(listBtAdapters()).toEqual(['hci0', 'hci1'])
    })

    test('returns [] off linux', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
      expect(listBtAdapters()).toEqual([])
    })

    test('returns [] when sysfs is unreadable', () => {
      mockedReaddir.mockImplementation(() => {
        throw new Error('ENOENT')
      })
      expect(listBtAdapters()).toEqual([])
    })
  })

  describe('listWifiChannels', () => {
    test('parses allowed 2.4 GHz channels from iw list', () => {
      mockedExec.mockReturnValue(IW_LIST)
      expect(listWifiChannels('2.4ghz')).toEqual([1, 2])
    })

    test('parses allowed 5 GHz channels skipping disabled and radar entries', () => {
      mockedExec.mockReturnValue(IW_LIST)
      expect(listWifiChannels('5ghz')).toEqual([36, 149])
    })

    test('falls back to standard channels when iw fails', () => {
      mockedExec.mockImplementation(() => {
        throw new Error('iw missing')
      })
      expect(listWifiChannels('2.4ghz')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
      expect(listWifiChannels('5ghz')).toEqual([36, 40, 44, 48, 149, 153, 157, 161, 165])
    })

    test('falls back when iw lists no usable channels', () => {
      mockedExec.mockReturnValue('Wiphy phy0\n    * 5200 MHz [40] (disabled)\n')
      expect(listWifiChannels('5ghz')).toEqual([36, 40, 44, 48, 149, 153, 157, 161, 165])
    })

    test('falls back off linux without running iw', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
      expect(listWifiChannels('2.4ghz')).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
      expect(mockedExec).not.toHaveBeenCalled()
    })
  })

  describe('listWifiCountryCodes', () => {
    test('parses countries from regdbdump excluding the world domain', () => {
      mockedExec.mockReturnValue(
        ['country 00: DFS-UNSET', 'country DE: DFS-ETSI', 'country AT: DFS-ETSI', 'junk'].join('\n')
      )
      expect(listWifiCountryCodes()).toEqual(['AT', 'DE'])
    })

    test('falls back to the static list when regdbdump fails', () => {
      mockedExec.mockImplementation(() => {
        throw new Error('regdbdump missing')
      })
      const codes = listWifiCountryCodes()
      expect(codes).toContain('DE')
      expect(codes).toContain('US')
      expect(codes).toEqual([...codes].sort())
    })

    test('falls back when the dump contains no countries', () => {
      mockedExec.mockReturnValue('country 00: DFS-UNSET\n')
      expect(listWifiCountryCodes()).toContain('DE')
    })
  })
})
