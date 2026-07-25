import type { DevListEntry } from '@shared/types'
import { DongleState } from '../DongleState'

type Payload = { type: string; payload: unknown }

function make(hasRenderer = true, hostDevList: DevListEntry[] = []) {
  const emit = vi.fn<[Payload], void>()
  const state = new DongleState({
    emit,
    hasRenderer: () => hasRenderer,
    getHostDevList: () => hostDevList
  })
  return { state, emit }
}

const sw = (version: string) => ({ version }) as never
const box = (settings: Record<string, unknown>) => ({ settings }) as never

describe('DongleState dongleInfo emit', () => {
  test('emits only for a new key, then de-dups', () => {
    const { state, emit } = make()
    state.handleSoftwareVersion(sw('1.0.0'))
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit.mock.calls[0][0]).toEqual({
      type: 'dongleInfo',
      payload: { dongleFwVersion: '1.0.0', boxInfo: undefined }
    })
    state.handleSoftwareVersion(sw('1.0.0'))
    expect(emit).toHaveBeenCalledTimes(1)
  })

  test('emits again when the key changes', () => {
    const { state, emit } = make()
    state.handleBoxInfo(box({ model: 'A15W' }))
    state.handleBoxInfo(box({ model: 'A15X' }))
    expect(emit).toHaveBeenCalledTimes(2)
  })

  test('does not emit without a renderer', () => {
    const { state, emit } = make(false)
    state.handleSoftwareVersion(sw('1.0.0'))
    expect(emit).not.toHaveBeenCalled()
  })

  test('falls back to String(boxInfo) when JSON.stringify throws', () => {
    const { state, emit } = make()
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(() => state.handleBoxInfo(box(circular))).not.toThrow()
    expect(emit).toHaveBeenCalledTimes(1)
  })
})

describe('DongleState DevList reconcile', () => {
  test('non-array DevList leaves the dongle list unchanged', () => {
    const { state } = make()
    state.handleBoxInfo(box({ DevList: 'nope' }))
    expect(state.getDongleDevList()).toEqual([])
  })

  test('maps dongle entries with source:dongle and merges with host (host wins)', () => {
    const host: DevListEntry[] = [{ id: 'AA:BB', name: 'HostPhone', source: 'host' }]
    const { state } = make(true, host)
    state.handleBoxInfo(
      box({
        DevList: [
          { id: 'aa:bb', name: 'DonglePhone' },
          { id: 'CC:DD', name: 'DongleOnly' }
        ]
      })
    )
    expect(state.getDongleDevList()).toEqual([
      { id: 'aa:bb', name: 'DonglePhone', source: 'dongle' },
      { id: 'CC:DD', name: 'DongleOnly', source: 'dongle' }
    ])
    // Merged list folded into boxInfo: host wins the AA:BB collision, dongle-unique appended.
    expect((state.getBoxInfo() as { DevList: DevListEntry[] }).DevList).toEqual([
      { id: 'AA:BB', name: 'HostPhone', source: 'host' },
      { id: 'CC:DD', name: 'DongleOnly', source: 'dongle' }
    ])
  })

  test('picks up the connected MAC from btMacAddr', () => {
    const { state } = make()
    state.handleBoxInfo(box({ btMacAddr: '  AA:BB:CC  ' }))
    expect(state.getConnectedMac()).toBe('AA:BB:CC')
  })
})

describe('DongleState clears', () => {
  test('clearOnDongleGone clears state, blanks btMacAddr, and emits unconditionally', () => {
    const { state, emit } = make()
    state.handleBoxInfo(box({ btMacAddr: 'AA:BB:CC', DevList: [{ id: 'X' }] }))
    emit.mockClear()

    state.clearOnDongleGone()
    expect(state.getDongleDevList()).toEqual([])
    expect(state.getConnectedMac()).toBe('')
    expect((state.getBoxInfo() as { btMacAddr: string }).btMacAddr).toBe('')
    expect(emit).toHaveBeenCalledTimes(1)
  })

  test('clearOnDongleGone emits even when the payload is unchanged', () => {
    const { state, emit } = make()
    state.clearOnDongleGone()
    emit.mockClear()
    state.clearOnDongleGone()
    expect(emit).toHaveBeenCalledTimes(1)
  })

  test('resetForTeardown clears fw + btMacAddr + dedup key without emitting', () => {
    const { state, emit } = make()
    state.handleSoftwareVersion(sw('1.0.0'))
    state.handleBoxInfo(box({ btMacAddr: 'AA:BB' }))
    emit.mockClear()

    state.resetForTeardown()
    expect(state.getFwVersion()).toBeUndefined()
    expect((state.getBoxInfo() as { btMacAddr: string }).btMacAddr).toBe('')
    expect(emit).not.toHaveBeenCalled()

    // dedup key was cleared → a following box info re-emits
    state.handleBoxInfo(box({ btMacAddr: 'AA:BB' }))
    expect(emit).toHaveBeenCalledTimes(1)
  })

  test('clearDongleSessionState clears devlist + connectedMac only, leaves boxInfo', () => {
    const { state, emit } = make()
    state.handleBoxInfo(box({ btMacAddr: 'AA:BB', DevList: [{ id: 'X' }] }))
    emit.mockClear()

    state.clearDongleSessionState()
    expect(state.getDongleDevList()).toEqual([])
    expect(state.getConnectedMac()).toBe('')
    expect(emit).not.toHaveBeenCalled()
    expect((state.getBoxInfo() as { btMacAddr: string }).btMacAddr).toBe('AA:BB')
  })
})
