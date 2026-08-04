import type { MiniDspStatus } from '@shared/types'
import { act, render } from '@testing-library/react'

const mocks = vi.hoisted(() => ({
  state: {
    settings: {
      minidsp: {
        enabled: true,
        mockDevice: false,
        serverUrl: 'http://127.0.0.1:5380',
        deviceIndex: 0,
        volumeMinDb: -80,
        volumeMaxDb: 0,
        volumeStepDb: 0.5,
        bassOutputChannels: [2, 3],
        bassGainDb: 0,
        bassMinDb: -80,
        bassMaxDb: 12,
        bassStepDb: 0.5,
        presets: [{ index: 0, label: 'Preset 1' }]
      }
    },
    saveSettings: vi.fn()
  }
}))

vi.mock('@store/store', () => ({
  useLiviStore: (selector: (state: typeof mocks.state) => unknown) => selector(mocks.state)
}))

import { MiniDsp } from '../MiniDsp'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

const status: MiniDspStatus = {
  connected: true,
  preset: 0,
  source: 'USB',
  volumeDb: -30,
  muted: false,
  productName: 'MiniDSP'
}

test('serializes polling and queues one refresh behind an in-flight request', async () => {
  vi.useFakeTimers()
  const first = deferred<MiniDspStatus>()
  const getStatus = vi
    .fn()
    .mockImplementationOnce(() => first.promise)
    .mockResolvedValue(status)
  window.minidsp = {
    getStatus,
    setVolume: vi.fn(),
    setBassGain: vi.fn(),
    selectPreset: vi.fn()
  }

  const view = render(<MiniDsp />)
  await act(async () => {})
  expect(getStatus).toHaveBeenCalledOnce()

  act(() => vi.advanceTimersByTime(15_000))
  expect(getStatus).toHaveBeenCalledOnce()

  await act(async () => {
    first.resolve(status)
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(getStatus).toHaveBeenCalledTimes(2)

  view.unmount()
  vi.useRealTimers()
})
