import type { MiniDspStatus } from '@shared/types'
import { act, fireEvent, render, screen } from '@testing-library/react'

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
import { MiniDspView } from '../MiniDspView'

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

const viewProps = () => ({
  config: {
    ...mocks.state.settings.minidsp,
    presets: [
      { index: 0, label: 'Preset 1' },
      { index: 3, label: 'Preset 4' }
    ]
  },
  status,
  volume: -30,
  bass: 0,
  busy: false,
  error: '',
  onRefresh: vi.fn(),
  onVolumeChange: vi.fn(),
  onVolumeCommit: vi.fn(),
  onBassChange: vi.fn(),
  onBassCommit: vi.fn(),
  onPresetSelect: vi.fn()
})

test('keeps volume, bass and preset controls wired to their configured values', () => {
  const props = viewProps()
  render(<MiniDspView {...props} />)

  expect(screen.getByRole('slider', { name: 'Master volume' })).toHaveValue('' + props.volume)
  expect(screen.getByRole('slider', { name: 'Bass' })).toHaveValue('0')
  expect(screen.getByText('Outputs 3 + 4')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Preset 1' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Preset 4' })).toHaveAttribute('aria-pressed', 'false')

  fireEvent.click(screen.getByRole('button', { name: 'Increase Master volume' }))
  expect(props.onVolumeChange).toHaveBeenCalledWith(-29.5)
  expect(props.onVolumeCommit).toHaveBeenCalledWith(-29.5)
  fireEvent.click(screen.getByRole('button', { name: 'Decrease Bass' }))
  expect(props.onBassChange).toHaveBeenCalledWith(-0.5)
  expect(props.onBassCommit).toHaveBeenCalledWith(-0.5)
  fireEvent.click(screen.getByRole('button', { name: 'Preset 4' }))
  expect(props.onPresetSelect).toHaveBeenCalledWith(3)
})

test('respects gain limits and disables controls while applying a change', () => {
  const props = viewProps()
  const view = render(
    <MiniDspView {...props} volume={props.config.volumeMaxDb} bass={props.config.bassMinDb} />
  )
  expect(screen.getByRole('button', { name: 'Increase Master volume' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Decrease Bass' })).toBeDisabled()

  view.rerender(<MiniDspView {...props} busy />)
  for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
  for (const slider of screen.getAllByRole('slider')) expect(slider).toBeDisabled()
})

test('shows loading, disconnected and error states with refresh available', () => {
  const props = viewProps()
  const view = render(<MiniDspView {...props} status={null} />)
  expect(screen.getByRole('progressbar', { name: 'Connecting to MiniDSP' })).toBeInTheDocument()

  view.rerender(<MiniDspView {...props} status={{ ...status, connected: false }} />)
  expect(screen.getByText('No MiniDSP connected')).toBeInTheDocument()
  expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh', exact: true }))
  expect(props.onRefresh).toHaveBeenCalledOnce()

  view.rerender(<MiniDspView {...props} error="Could not reach daemon" />)
  expect(screen.getByRole('alert')).toHaveTextContent('Could not reach daemon')
  expect(screen.getByText('Unavailable')).toBeInTheDocument()
  expect(screen.queryByRole('slider')).not.toBeInTheDocument()
})
