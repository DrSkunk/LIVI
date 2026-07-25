import type { PairedDevice } from '../BluezDeviceClient'
import { BtPairedRegistry } from '../BtPairedRegistry'

type Payload = { type: string; payload: unknown }

function make(hasRenderer = true) {
  const emit = vi.fn<[Payload], void>()
  const reg = new BtPairedRegistry({ emit, hasRenderer: () => hasRenderer })
  return { reg, emit }
}

const line = (mac: string, name = '') => `${mac}${name}`

const PHONE_COD = 0x5a020c
const AUDIO_COD = 0x240404

const dev = (mac: string, over: Partial<PairedDevice> = {}): PairedDevice => ({
  mac,
  name: 'Dev',
  connected: false,
  trusted: true,
  class: PHONE_COD,
  path: `/org/bluez/${mac}`,
  ...over
})

describe('BtPairedRegistry.emitCombined', () => {
  test('setDonglePairedRaw emits the combined list as a bluetoothPairedList event', () => {
    const { reg, emit } = make()
    reg.setDonglePairedRaw(`${line('AA:BB:CC:DD:EE:FF', 'Pixel')}\n`)
    expect(emit).toHaveBeenCalledWith({
      type: 'bluetoothPairedList',
      payload: 'AA:BB:CC:DD:EE:FFPixel\n'
    })
  })

  test('dongle wins on MAC collision, host duplicate is dropped', () => {
    const { reg, emit } = make()
    reg.ingest(
      [dev('AA:BB:CC:DD:EE:FF', { name: 'HostName' }), dev('11:22:33:44:55:66', { name: 'Other' })],
      { cpClaimedBtMacs: new Set(), keepHostRawIfEmpty: false }
    )
    emit.mockClear()
    reg.setDonglePairedRaw(`${line('AA:BB:CC:DD:EE:FF', 'DongleName')}\n`)
    const payload = emit.mock.calls[0][0].payload as string
    // Dongle line first, host entry for the same MAC filtered, unique host entry kept.
    expect(payload).toBe('AA:BB:CC:DD:EE:FFDongleName\n11:22:33:44:55:66Other\n')
  })

  test('skips lines shorter than 17 chars and MACs without a colon', () => {
    const { reg, emit } = make()
    reg.setDonglePairedRaw(
      ['short', '................pad', line('AA:BB:CC:DD:EE:FF', 'Ok')].join('\n')
    )
    const payload = emit.mock.calls[0][0].payload as string
    expect(payload).toBe('AA:BB:CC:DD:EE:FFOk\n')
  })

  test('trims a trailing CR from CRLF line endings', () => {
    const { reg, emit } = make()
    reg.setDonglePairedRaw(`${line('AA:BB:CC:DD:EE:FF', 'Name')}\r\n`)
    const payload = emit.mock.calls[0][0].payload as string
    expect(payload).toBe('AA:BB:CC:DD:EE:FFName\n')
  })

  test('empty sources emit an empty string', () => {
    const { reg, emit } = make()
    reg.setDonglePairedRaw('')
    expect(emit.mock.calls[0][0].payload).toBe('')
  })

  test('does not emit when no renderer is attached', () => {
    const { reg, emit } = make(false)
    reg.setDonglePairedRaw(`${line('AA:BB:CC:DD:EE:FF', 'Pixel')}\n`)
    expect(emit).not.toHaveBeenCalled()
  })

  test('clearDongleRaw drops the dongle source without emitting', () => {
    const { reg, emit } = make()
    reg.setDonglePairedRaw(`${line('AA:BB:CC:DD:EE:FF', 'Pixel')}\n`)
    emit.mockClear()

    reg.clearDongleRaw()
    expect(emit).not.toHaveBeenCalled()

    // Next explicit emit reflects the cleared dongle source.
    reg.emitCombined()
    expect(emit.mock.calls[0][0].payload).toBe('')
  })
})

describe('BtPairedRegistry.ingest', () => {
  const noCp = { cpClaimedBtMacs: new Set<string>(), keepHostRawIfEmpty: false }

  test('builds the upper-cased name cache and emits the combined list', () => {
    const { reg, emit } = make()
    reg.ingest([dev('aa:bb:cc:dd:ee:ff', { name: 'Pixel' })], noCp)
    expect(reg.getName('AA:BB:CC:DD:EE:FF')).toBe('Pixel')
    expect(emit.mock.calls[0][0].payload).toBe('aa:bb:cc:dd:ee:ffPixel\n')
  })

  test('picks the connected phone and skips cp-claimed macs', () => {
    const { reg } = make()
    const res = reg.ingest(
      [
        dev('AA:BB:CC:DD:EE:FF', { connected: true }),
        dev('11:22:33:44:55:66', { connected: true })
      ],
      { cpClaimedBtMacs: new Set(['AA:BB:CC:DD:EE:FF']), keepHostRawIfEmpty: false }
    )
    expect(res.connectedMac).toBe('11:22:33:44:55:66')
    expect(reg.getConnectedMac()).toBe('11:22:33:44:55:66')
  })

  test('preferMac overrides connectedMac cache but returns the raw connected', () => {
    const { reg } = make()
    const res = reg.ingest(
      [
        dev('AA:BB:CC:DD:EE:FF', { connected: true }),
        dev('11:22:33:44:55:66', { connected: true })
      ],
      { cpClaimedBtMacs: new Set(), preferMac: '11:22:33:44:55:66', keepHostRawIfEmpty: false }
    )
    expect(res.connectedMac).toBe('AA:BB:CC:DD:EE:FF')
    expect(reg.getConnectedMac()).toBe('11:22:33:44:55:66')
  })

  test('returns only the phone-like subset', () => {
    const { reg } = make()
    const res = reg.ingest(
      [dev('AA:BB:CC:DD:EE:FF'), dev('11:22:33:44:55:66', { class: AUDIO_COD })],
      noCp
    )
    expect(res.phones.map((p) => p.mac)).toEqual(['AA:BB:CC:DD:EE:FF'])
  })

  test('keepHostRawIfEmpty keeps the previous host list on an empty response', () => {
    const { reg, emit } = make()
    reg.ingest([dev('AA:BB:CC:DD:EE:FF', { name: 'Pixel' })], noCp)
    emit.mockClear()

    reg.ingest([], { cpClaimedBtMacs: new Set(), keepHostRawIfEmpty: true })
    expect(emit.mock.calls[0][0].payload).toBe('AA:BB:CC:DD:EE:FFPixel\n')

    reg.ingest([], { cpClaimedBtMacs: new Set(), keepHostRawIfEmpty: false })
    expect(emit.mock.calls[1][0].payload).toBe('')
  })
})
