import { BtPairedRegistry } from '../BtPairedRegistry'

type Payload = { type: string; payload: unknown }

function make(hasRenderer = true) {
  const emit = vi.fn<[Payload], void>()
  const reg = new BtPairedRegistry({ emit, hasRenderer: () => hasRenderer })
  return { reg, emit }
}

const line = (mac: string, name = '') => `${mac}${name}`

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
    reg.setHostPairedRaw(
      `${line('AA:BB:CC:DD:EE:FF', 'HostName')}\n${line('11:22:33:44:55:66', 'Other')}\n`
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
