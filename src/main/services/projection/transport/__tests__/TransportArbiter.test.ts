import type { Device } from 'usb'
import type { Mock } from 'vitest'
import { TransportArbiter } from '../TransportArbiter'
import type { ArbiterDeps, Transport } from '../types'

type DepStubs = {
  wirelessAaEnabled: boolean
  wirelessPhoneInRange: boolean
  active: Transport | null
  dongleSessionActive: boolean
  wiredAaSessionActive: boolean
  wiredCpSessionActive: boolean
  wiredSession: boolean
  onChange: Mock
  onShouldStop: Mock
  onShouldAutoStart: Mock
  onShouldBringUpWiredBeside: Mock
  onWiredPhoneGone: Mock
}

function makeArbiter(overrides: Partial<DepStubs> = {}) {
  const stubs: DepStubs = {
    wirelessAaEnabled: false,
    wirelessPhoneInRange: true,
    active: null,
    dongleSessionActive: false,
    wiredAaSessionActive: false,
    wiredCpSessionActive: false,
    wiredSession: false,
    onChange: vi.fn(),
    onShouldStop: vi.fn(async () => {}),
    onShouldAutoStart: vi.fn(),
    onShouldBringUpWiredBeside: vi.fn(),
    onWiredPhoneGone: vi.fn(),
    ...overrides
  }
  const deps: ArbiterDeps = {
    isWirelessEnabled: () => stubs.wirelessAaEnabled,
    isWirelessPhoneInRange: () => stubs.wirelessPhoneInRange,
    getActiveTransport: () => stubs.active,
    isDongleSessionActive: () => stubs.dongleSessionActive,
    isWiredAaSessionActive: () => stubs.wiredAaSessionActive,
    isWiredCpSessionActive: () => stubs.wiredCpSessionActive,
    hasWiredSession: () => stubs.wiredSession,
    onChange: stubs.onChange,
    onShouldStop: stubs.onShouldStop,
    onShouldAutoStart: stubs.onShouldAutoStart,
    onShouldBringUpWiredBeside: stubs.onShouldBringUpWiredBeside,
    onWiredPhoneGone: stubs.onWiredPhoneGone
  }
  return { arbiter: new TransportArbiter(deps), stubs }
}

function fakeDevice(): Device {
  return {
    deviceDescriptor: { idVendor: 0x18d1, idProduct: 0x4ee1 }
  } as unknown as Device
}

describe('TransportArbiter', () => {
  beforeEach(async () => vi.useFakeTimers())
  afterEach(async () => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  describe('presence — dongle', () => {
    test('attach sets state and fires onChange', async () => {
      const { arbiter, stubs } = makeArbiter()
      arbiter.markDongleConnected(true)
      expect(arbiter.isDongleDetected()).toBe(true)
      expect(stubs.onChange).toHaveBeenCalledTimes(1)
    })

    test('attach is idempotent', async () => {
      const { arbiter, stubs } = makeArbiter()
      arbiter.markDongleConnected(true)
      arbiter.markDongleConnected(true)
      expect(stubs.onChange).toHaveBeenCalledTimes(1)
    })

    test('detach waits the full debounce when dongle session is not active', async () => {
      const { arbiter, stubs } = makeArbiter()
      arbiter.markDongleConnected(true)
      stubs.onChange.mockClear()

      arbiter.markDongleConnected(false)
      expect(arbiter.isDongleDetected()).toBe(true)
      expect(stubs.onChange).not.toHaveBeenCalled()

      vi.advanceTimersByTime(3_999)
      expect(arbiter.isDongleDetected()).toBe(true)

      vi.advanceTimersByTime(1)
      expect(arbiter.isDongleDetected()).toBe(false)
      expect(stubs.onChange).toHaveBeenCalled()
    })

    test('detach commits immediately when the dongle owns the active session', async () => {
      const { arbiter, stubs } = makeArbiter({ dongleSessionActive: true, active: 'dongle' })
      arbiter.markDongleConnected(true)
      stubs.onChange.mockClear()

      arbiter.markDongleConnected(false)
      vi.advanceTimersByTime(0)
      // setTimeout(_, 0) fires on next tick
      vi.runOnlyPendingTimers()

      expect(arbiter.isDongleDetected()).toBe(false)
      expect(stubs.onShouldStop).toHaveBeenCalledTimes(1)
    })

    test('detach re-attach within the window cancels the debounce', async () => {
      const { arbiter, stubs } = makeArbiter()
      arbiter.markDongleConnected(true)
      arbiter.markDongleConnected(false)
      vi.advanceTimersByTime(2_000)
      arbiter.markDongleConnected(true)
      vi.advanceTimersByTime(5_000)

      expect(arbiter.isDongleDetected()).toBe(true)
      expect(stubs.onShouldStop).not.toHaveBeenCalled()
    })

    test('detach without prior attach is a no-op', async () => {
      const { arbiter, stubs } = makeArbiter()
      arbiter.markDongleConnected(false)
      expect(stubs.onChange).not.toHaveBeenCalled()
    })

    test('detach triggers onShouldAutoStart when a phone is present', async () => {
      const { arbiter, stubs } = makeArbiter({
        dongleSessionActive: true,
        active: 'dongle'
      })
      arbiter.markDongleConnected(true)
      arbiter.markPhoneConnected(true, fakeDevice())
      stubs.onShouldAutoStart.mockClear()

      arbiter.markDongleConnected(false)
      vi.runOnlyPendingTimers()
      await Promise.resolve()
      await Promise.resolve()

      expect(stubs.onShouldAutoStart).toHaveBeenCalled()
    })
  })

  describe('presence — phone', () => {
    test('attach sets state, stores device, fires autoStart on the first attach', async () => {
      const { arbiter, stubs } = makeArbiter()
      const d = fakeDevice()
      arbiter.markPhoneConnected(true, d)

      expect(arbiter.isPhoneConnected()).toBe(true)
      expect(arbiter.getPhoneDevice()).toBe(d)
      expect(stubs.onShouldAutoStart).toHaveBeenCalledTimes(1)
    })

    test('subsequent attaches do not re-fire autoStart', async () => {
      const { arbiter, stubs } = makeArbiter()
      arbiter.markPhoneConnected(true, fakeDevice())
      stubs.onShouldAutoStart.mockClear()

      arbiter.markPhoneConnected(true, fakeDevice())
      expect(stubs.onShouldAutoStart).not.toHaveBeenCalled()
    })

    test('detach waits the 1s debounce', async () => {
      const { arbiter } = makeArbiter()
      arbiter.markPhoneConnected(true, fakeDevice())
      arbiter.markPhoneConnected(false)

      vi.advanceTimersByTime(999)
      expect(arbiter.isPhoneConnected()).toBe(true)
      vi.advanceTimersByTime(1)
      expect(arbiter.isPhoneConnected()).toBe(false)
    })

    test('detach stops the wired AA session if it owns the transport', async () => {
      const { arbiter, stubs } = makeArbiter({
        wiredAaSessionActive: true,
        wiredSession: true,
        active: 'aa'
      })
      arbiter.markPhoneConnected(true, fakeDevice())
      arbiter.markPhoneConnected(false)
      vi.advanceTimersByTime(1_000)

      expect(stubs.onWiredPhoneGone).toHaveBeenCalledTimes(1)
    })

    test('detach stops a held wired session even when another transport is active', async () => {
      const { arbiter, stubs } = makeArbiter({
        wiredAaSessionActive: false,
        wiredSession: true,
        active: 'cp'
      })
      arbiter.markPhoneConnected(true, fakeDevice())
      arbiter.markPhoneConnected(false)
      vi.advanceTimersByTime(1_000)

      expect(stubs.onWiredPhoneGone).toHaveBeenCalledTimes(1)
    })

    test('re-attach during detach debounce commits the detach inline', async () => {
      const { arbiter, stubs } = makeArbiter({
        wiredAaSessionActive: true,
        wiredSession: true,
        active: 'aa'
      })
      arbiter.markPhoneConnected(true, fakeDevice())
      arbiter.markPhoneConnected(false)
      // Re-plug while debounce is still pending
      arbiter.markPhoneConnected(true, fakeDevice())

      expect(stubs.onWiredPhoneGone).toHaveBeenCalledTimes(1)
      // The re-enumerated phone owned the stopped session: autoStart is chained
      // after the stop. The initial attach during an active session is held.
      await Promise.resolve()
      await Promise.resolve()
      expect(stubs.onShouldAutoStart).toHaveBeenCalledTimes(1)
    })
  })

  describe('presence — debounce guards', () => {
    test('a second dongle detach while the debounce is pending is a no-op', async () => {
      const { arbiter, stubs } = makeArbiter()
      arbiter.markDongleConnected(true)
      stubs.onChange.mockClear()

      arbiter.markDongleConnected(false)
      arbiter.markDongleConnected(false)
      vi.advanceTimersByTime(4_000)

      expect(arbiter.isDongleDetected()).toBe(false)
      expect(stubs.onChange).toHaveBeenCalledTimes(1)
    })

    test('a second phone detach while the debounce is pending is a no-op', async () => {
      const { arbiter, stubs } = makeArbiter()
      arbiter.markPhoneConnected(true, fakeDevice())
      stubs.onChange.mockClear()

      arbiter.markPhoneConnected(false)
      arbiter.markPhoneConnected(false)
      vi.advanceTimersByTime(1_000)

      expect(arbiter.isPhoneConnected()).toBe(false)
      expect(stubs.onChange).toHaveBeenCalledTimes(1)
    })

    test('a throwing stop after dongle unplug is contained', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(function () {})
      const { arbiter, stubs } = makeArbiter({ dongleSessionActive: true, active: 'dongle' })
      stubs.onShouldStop.mockRejectedValue(new Error('stop boom'))
      arbiter.markDongleConnected(true)

      arbiter.markDongleConnected(false)
      vi.runOnlyPendingTimers()
      await Promise.resolve()
      await Promise.resolve()

      expect(arbiter.isDongleDetected()).toBe(false)
      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    })

    test('re-attach during detach debounce without a wired session skips the teardown', async () => {
      const { arbiter, stubs } = makeArbiter({ wiredSession: false })
      arbiter.markPhoneConnected(true, fakeDevice())
      arbiter.markPhoneConnected(false)
      stubs.onShouldAutoStart.mockClear()

      arbiter.markPhoneConnected(true, fakeDevice())

      expect(stubs.onWiredPhoneGone).not.toHaveBeenCalled()
      expect(arbiter.isPhoneConnected()).toBe(true)
      expect(stubs.onShouldAutoStart).toHaveBeenCalledTimes(1)
    })

    test('phone attach without a device object keeps the stored device', async () => {
      const { arbiter } = makeArbiter()
      arbiter.markPhoneConnected(true)
      expect(arbiter.isPhoneConnected()).toBe(true)
      expect(arbiter.getPhoneDevice()).toBeNull()
    })
  })

  describe('hasNativeCandidate', () => {
    test('true when a wired phone is attached', async () => {
      const { arbiter } = makeArbiter()
      arbiter.markPhoneConnected(true, fakeDevice())
      expect(arbiter.hasNativeCandidate()).toBe(true)
    })

    test('true when wireless is enabled and a phone is in range', async () => {
      const { arbiter } = makeArbiter({ wirelessAaEnabled: true, wirelessPhoneInRange: true })
      expect(arbiter.hasNativeCandidate()).toBe(true)
    })

    test('false when wireless is disabled and no phone is attached', async () => {
      const { arbiter } = makeArbiter({ wirelessAaEnabled: false })
      expect(arbiter.hasNativeCandidate()).toBe(false)
    })
  })

  describe('candidates and overrides', () => {
    const CP_WIRED = { transport: 'cp', mode: 'wired' }
    const AA_WIRED = { transport: 'aa', mode: 'wired' }
    const AA_WIRELESS = { transport: 'aa', mode: 'wireless' }

    function appleDevice(): Device {
      return { vendorId: 0x05ac } as unknown as Device
    }

    test('an Apple wired phone is offered as wired CarPlay', async () => {
      const { arbiter } = makeArbiter()
      arbiter.markPhoneConnected(true, appleDevice())
      expect(arbiter.pickPreferred()).toEqual(CP_WIRED)
    })

    test('wireless is offered during a wired AA session even without a phone in range', async () => {
      const { arbiter } = makeArbiter({
        wirelessAaEnabled: true,
        wirelessPhoneInRange: false,
        wiredAaSessionActive: true
      })
      expect(arbiter.pickPreferred()).toEqual(AA_WIRELESS)
    })

    test('an active CP session anchors on wired or wireless CarPlay', async () => {
      const wired = makeArbiter({ active: 'cp', wiredCpSessionActive: true })
      wired.arbiter.markDongleConnected(true)
      wired.arbiter.markPhoneConnected(true, appleDevice())
      expect(wired.arbiter.pickPreferred()).toEqual(CP_WIRED)

      const wireless = makeArbiter({ active: 'cp', wiredCpSessionActive: false })
      wireless.arbiter.markDongleConnected(true)
      expect(wireless.arbiter.pickPreferred()).toEqual({ transport: 'dongle', mode: 'wired' })
    })

    test('setOverride forces the candidate and fires onChange', async () => {
      const { arbiter, stubs } = makeArbiter()
      arbiter.markPhoneConnected(true, fakeDevice())
      stubs.onChange.mockClear()

      arbiter.setOverride(AA_WIRED)
      expect(arbiter.getOverride()).toEqual(AA_WIRED)
      expect(stubs.onChange).toHaveBeenCalledTimes(1)
      expect(arbiter.pickPreferred()).toEqual(AA_WIRED)
    })

    test('pickPreferred drops an override that is no longer detected', async () => {
      const { arbiter } = makeArbiter()
      arbiter.markDongleConnected(true)
      arbiter.setOverride(AA_WIRED)

      expect(arbiter.pickPreferred()).toEqual({ transport: 'dongle', mode: 'wired' })
      expect(arbiter.getOverride()).toBeNull()
    })

    test('a detach commit keeps an override that is still detected', async () => {
      const { arbiter } = makeArbiter()
      arbiter.markDongleConnected(true)
      arbiter.markPhoneConnected(true, fakeDevice())
      arbiter.setOverride(AA_WIRED)

      arbiter.markDongleConnected(false)
      vi.advanceTimersByTime(4_000)

      expect(arbiter.getOverride()).toEqual(AA_WIRED)
    })
  })

  describe('re-enumeration window', () => {
    test('isExpectingPhoneReenumeration is time-bounded', async () => {
      const { arbiter } = makeArbiter()
      const t0 = Date.now()
      vi.setSystemTime(t0)
      arbiter.expectPhoneReenumeration(500)
      expect(arbiter.isExpectingPhoneReenumeration()).toBe(true)

      vi.setSystemTime(t0 + 499)
      expect(arbiter.isExpectingPhoneReenumeration()).toBe(true)

      vi.setSystemTime(t0 + 600)
      expect(arbiter.isExpectingPhoneReenumeration()).toBe(false)
    })
  })

  describe('pickPreferred', () => {
    const DONGLE = { transport: 'dongle', mode: 'wired' }
    const AA_WIRED = { transport: 'aa', mode: 'wired' }
    const AA_WIRELESS = { transport: 'aa', mode: 'wireless' }

    test('returns null when nothing is present', async () => {
      const { arbiter } = makeArbiter()
      expect(arbiter.pickPreferred()).toBeNull()
    })

    test('returns dongle when only dongle is present', async () => {
      const { arbiter } = makeArbiter()
      arbiter.markDongleConnected(true)
      expect(arbiter.pickPreferred()).toEqual(DONGLE)
    })

    test('returns wired aa when only a wired phone is present', async () => {
      const { arbiter } = makeArbiter()
      arbiter.markPhoneConnected(true, fakeDevice())
      expect(arbiter.pickPreferred()).toEqual(AA_WIRED)
    })

    test('returns wireless aa when only wireless is eligible', async () => {
      const { arbiter } = makeArbiter({ wirelessAaEnabled: true })
      expect(arbiter.pickPreferred()).toEqual(AA_WIRELESS)
    })

    test("'auto' sticks to the active transport", () => {
      const { arbiter } = makeArbiter({ active: 'dongle' })
      arbiter.markDongleConnected(true)
      arbiter.markPhoneConnected(true, fakeDevice())
      expect(arbiter.pickPreferred()).toEqual(DONGLE)
    })

    test('override beats preference', async () => {
      const { arbiter } = makeArbiter()
      arbiter.markDongleConnected(true)
      arbiter.markPhoneConnected(true, fakeDevice())
      arbiter.prepareSwitch()
      expect(arbiter.pickPreferred()).toEqual(AA_WIRED)
    })

    test('override is dropped when the chosen candidate disappears', async () => {
      const { arbiter } = makeArbiter()
      arbiter.markDongleConnected(true)
      arbiter.markPhoneConnected(true, fakeDevice())
      arbiter.prepareSwitch() // anchor=DONGLE (pref), cycles to AA_WIRED

      arbiter.markPhoneConnected(false)
      vi.advanceTimersByTime(1_000)

      expect(arbiter.getOverride()).toBeNull()
      expect(arbiter.pickPreferred()).toEqual(DONGLE)
    })
  })

  describe('decideNextStart', () => {
    const AA_WIRED = { transport: 'aa', mode: 'wired' }

    test('none when nothing is present', async () => {
      const { arbiter } = makeArbiter()
      expect(arbiter.decideNextStart()).toEqual({ kind: 'none' })
    })

    test('start with the preferred candidate', async () => {
      const { arbiter } = makeArbiter()
      arbiter.markPhoneConnected(true, fakeDevice())
      expect(arbiter.decideNextStart()).toEqual({ kind: 'start', candidate: AA_WIRED })
    })
  })

  describe('prepareSwitch', () => {
    const DONGLE = { transport: 'dongle', mode: 'wired' }
    const AA_WIRED = { transport: 'aa', mode: 'wired' }
    const AA_WIRELESS = { transport: 'aa', mode: 'wireless' }

    test('refuses to switch when only one candidate is present', async () => {
      const { arbiter } = makeArbiter({ active: 'dongle' })
      arbiter.markDongleConnected(true)
      const r = arbiter.prepareSwitch()
      expect(r.ok).toBe(false)
    })

    test('switches dongle → wired aa', async () => {
      const { arbiter, stubs } = makeArbiter({ active: 'dongle', dongleSessionActive: true })
      arbiter.markDongleConnected(true)
      arbiter.markPhoneConnected(true, fakeDevice())
      const r = arbiter.prepareSwitch()
      expect(r).toEqual({ ok: true, target: AA_WIRED })
      expect(arbiter.getOverride()).toEqual(AA_WIRED)
      // sanity: the underlying snapshot session-active stub is what determines current
      expect(stubs.dongleSessionActive).toBe(true)
    })

    test('switches wired aa → dongle', async () => {
      const { arbiter } = makeArbiter({ active: 'aa', wiredAaSessionActive: true })
      arbiter.markDongleConnected(true)
      arbiter.markPhoneConnected(true, fakeDevice())
      const r = arbiter.prepareSwitch()
      expect(r).toEqual({ ok: true, target: DONGLE })
    })

    test('cycles wired aa → wireless aa when both are eligible without dongle', async () => {
      const { arbiter } = makeArbiter({
        active: 'aa',
        wiredAaSessionActive: true,
        wirelessAaEnabled: true
      })
      arbiter.markPhoneConnected(true, fakeDevice())
      const r = arbiter.prepareSwitch()
      expect(r).toEqual({ ok: true, target: AA_WIRELESS })
    })

    test('cycles wireless aa → wired aa when phone is still plugged', async () => {
      const { arbiter } = makeArbiter({
        active: 'aa',
        wiredAaSessionActive: false,
        wirelessAaEnabled: true
      })
      arbiter.markPhoneConnected(true, fakeDevice())
      const r = arbiter.prepareSwitch()
      expect(r).toEqual({ ok: true, target: AA_WIRED })
    })
  })

  describe('snapshot', () => {
    test('reports an active wired CP session with no wireless phone anywhere', async () => {
      const { arbiter } = makeArbiter({
        active: 'cp',
        wiredCpSessionActive: true,
        wirelessAaEnabled: true,
        wirelessPhoneInRange: false
      })
      arbiter.markPhoneConnected(true, { vendorId: 0x05ac } as unknown as Device)

      const snap = arbiter.getSnapshot()
      expect(snap.active).toBe('cp')
      expect(snap.targetTransport).toBe('cp')
      expect(snap.targetMode).toBe('wired')
      expect(snap.wiredPhoneActive).toBe(true)
      expect(snap.wirelessPhoneActive).toBe(false)
      expect(snap.wirelessPhoneDetected).toBe(false)
    })

    test('reports an active wireless CP session as a detected wireless phone', async () => {
      const { arbiter } = makeArbiter({
        active: 'cp',
        wiredCpSessionActive: false,
        wirelessAaEnabled: true,
        wirelessPhoneInRange: false
      })

      const snap = arbiter.getSnapshot()
      expect(snap.wiredPhoneActive).toBe(false)
      expect(snap.wirelessPhoneActive).toBe(true)
      expect(snap.wirelessPhoneDetected).toBe(true)
    })

    test('reflects current presence + preference', async () => {
      const { arbiter, stubs } = makeArbiter({ active: 'aa' })
      arbiter.markDongleConnected(true)
      arbiter.markPhoneConnected(true, fakeDevice())

      const snap = arbiter.getSnapshot()
      expect(snap).toEqual({
        active: 'aa',
        targetTransport: 'aa',
        targetMode: 'wireless',
        switchPending: false,
        dongleDetected: true,
        wiredPhoneDetected: true,
        wirelessPhoneDetected: false,
        wirelessPhoneActive: true,
        wiredPhoneActive: false
      })
      expect(stubs.onChange).toHaveBeenCalled()
    })
  })
})
