import { execFileSync } from 'node:child_process'

function run(cmd: string, args: string[]): string | null {
  if (process.platform !== 'linux') return null
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout: 3000 })
  } catch {
    return null
  }
}

const FALLBACK_CHANNELS_24 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const FALLBACK_CHANNELS_5 = [36, 40, 44, 48, 149, 153, 157, 161, 165]

const FALLBACK_COUNTRIES = [
  'DE',
  'AT',
  'CH',
  'NL',
  'BE',
  'LU',
  'FR',
  'GB',
  'IE',
  'IT',
  'ES',
  'PT',
  'PL',
  'CZ',
  'SK',
  'HU',
  'RO',
  'BG',
  'GR',
  'HR',
  'SI',
  'DK',
  'SE',
  'NO',
  'FI',
  'IS',
  'EE',
  'LV',
  'LT',
  'US',
  'CA',
  'MX',
  'BR',
  'AU',
  'NZ',
  'JP',
  'KR',
  'CN',
  'IN',
  'ZA',
  'AE',
  'TR',
  'UA'
]

// Non-DFS standard AP channels; DFS (52-64, 100-144).
const ALLOWED_CHANNELS_24 = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
const ALLOWED_CHANNELS_5 = new Set([36, 40, 44, 48, 149, 153, 157, 161, 165])

export function listWifiChannels(band: '2.4ghz' | '5ghz'): number[] {
  const is5 = band === '5ghz'
  const allowed = is5 ? ALLOWED_CHANNELS_5 : ALLOWED_CHANNELS_24
  const out = run('iw', ['list'])
  if (out) {
    const chans = new Set<number>()
    for (const line of out.split('\n')) {
      if (/disabled|no ir|radar/i.test(line)) continue
      const m = line.match(/^\s*\*\s*(\d+)(?:\.\d+)?\s*MHz\s*\[(\d+)\]/)
      if (!m) continue
      const freq = Number(m[1])
      const ch = Number(m[2])
      const bandIs5 = freq >= 4900 && freq < 5900
      const bandIs24 = freq >= 2400 && freq < 2500
      if (((is5 && bandIs5) || (!is5 && bandIs24)) && allowed.has(ch)) chans.add(ch)
    }
    if (chans.size > 0) return [...chans].sort((a, b) => a - b)
  }
  return is5 ? FALLBACK_CHANNELS_5 : FALLBACK_CHANNELS_24
}

export function listWifiCountryCodes(): string[] {
  const out = run('regdbdump', ['/lib/firmware/regulatory.db'])
  if (out) {
    const codes = new Set<string>()
    for (const line of out.split('\n')) {
      const m = line.match(/^country ([A-Z]{2}):/)
      if (m && m[1] !== '00') codes.add(m[1])
    }
    if (codes.size > 0) return [...codes].sort()
  }
  return [...FALLBACK_COUNTRIES].sort()
}
