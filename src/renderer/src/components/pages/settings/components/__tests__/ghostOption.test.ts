import { findOptionForValue, withGhostOption } from '../ghostOption'

const formatOffline = (name: string): string => `${name} (offline)`

const liveOptions = [
  { value: '', label: 'System default' },
  { value: 'live_sink', label: 'USB Speaker' }
]

describe('withGhostOption', () => {
  test('returns input unchanged when value is empty', () => {
    expect(withGhostOption(liveOptions, '', 'My BT', formatOffline)).toBe(liveOptions)
  })

  test('returns input unchanged when value is null/undefined', () => {
    expect(withGhostOption(liveOptions, null, 'My BT', formatOffline)).toBe(liveOptions)
    expect(withGhostOption(liveOptions, undefined, 'My BT', formatOffline)).toBe(liveOptions)
  })

  test('returns input unchanged when value is in the live list', () => {
    expect(withGhostOption(liveOptions, 'live_sink', 'USB Speaker', formatOffline)).toBe(
      liveOptions
    )
  })

  test('returns input unchanged when value missing and no saved label', () => {
    expect(withGhostOption(liveOptions, 'absent_sink', undefined, formatOffline)).toBe(liveOptions)
  })

  test('appends ghost entry when value missing but saved label exists', () => {
    const out = withGhostOption(liveOptions, 'absent_sink', 'EPOS ADAPT 660', formatOffline)
    expect(out).toHaveLength(liveOptions.length + 1)
    expect(out[out.length - 1]).toEqual({
      value: 'absent_sink',
      label: 'EPOS ADAPT 660 (offline)'
    })
  })

  test('does not mutate the input array', () => {
    const before = liveOptions.length
    withGhostOption(liveOptions, 'absent_sink', 'X', formatOffline)
    expect(liveOptions).toHaveLength(before)
  })

  test('returns input unchanged when a live option shares the saved MAC', () => {
    const btLive = [{ value: 'bluez_output.AA_BB_CC_DD_EE_FF.2', label: 'Headset' }]
    expect(
      withGhostOption(btLive, 'bluez_output.AA_BB_CC_DD_EE_FF.1', 'Saved', formatOffline)
    ).toBe(btLive)
  })
})

describe('findOptionForValue', () => {
  const btOptions = [
    { value: '', label: 'System default' },
    { value: 'bluez_output.AA_BB_CC_DD_EE_FF.2', label: 'Headset', offline: false },
    { value: 'bluez_output.11_22_33_44_55_66.1', label: 'Offline set', offline: true }
  ]

  test('returns the directly matching option', () => {
    expect(findOptionForValue(btOptions, 'bluez_output.AA_BB_CC_DD_EE_FF.2')).toBe(btOptions[1])
  })

  test('returns undefined when value has no MAC and no direct match', () => {
    expect(findOptionForValue(btOptions, 'missing')).toBeUndefined()
  })

  test('matches a live option by MAC when the exact id differs', () => {
    expect(findOptionForValue(btOptions, 'bluez_output.AA_BB_CC_DD_EE_FF.9')).toBe(btOptions[1])
  })

  test('ignores offline options and returns undefined when only offline MAC matches', () => {
    expect(findOptionForValue(btOptions, 'bluez_output.11_22_33_44_55_66.9')).toBeUndefined()
  })

  test('returns undefined for a numeric value with no direct match', () => {
    expect(findOptionForValue(btOptions, 999)).toBeUndefined()
  })
})
