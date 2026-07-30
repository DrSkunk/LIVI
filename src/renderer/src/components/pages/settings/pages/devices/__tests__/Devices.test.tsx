import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { DeviceView } from '../useDevices'

const { deviceState, navigateMock, forgetDongleMock, selectMock, forgetMock } = vi.hoisted(() => ({
  deviceState: { list: [] as unknown[] },
  navigateMock: vi.fn(),
  forgetDongleMock: vi.fn(),
  selectMock: vi.fn(async () => ({ ok: true })),
  forgetMock: vi.fn()
}))

vi.mock('../useDevices', () => ({
  useDevices: () => deviceState.list,
  selectDevice: (id: string) => selectMock(id),
  forgetDevice: (id: string) => forgetMock(id)
}))

vi.mock('react-router', () => ({ useNavigate: () => navigateMock }))

vi.mock('@renderer/store/store', () => ({
  useLiviStore: (selector: (s: unknown) => unknown) =>
    selector({ forgetBluetoothPairedDevice: forgetDongleMock })
}))

import { Devices } from '../Devices'

function dev(over: Partial<DeviceView> = {}): DeviceView {
  return {
    id: 'd1',
    name: 'Phone',
    protocol: 'carplay',
    status: 'available',
    ...over
  } as DeviceView
}

beforeEach(() => {
  deviceState.list = []
  navigateMock.mockReset()
  forgetDongleMock.mockReset()
  forgetMock.mockReset()
  selectMock.mockReset().mockResolvedValue({ ok: true })
})

describe('Devices', () => {
  test('shows the empty state when no devices are paired', () => {
    render(<Devices />)
    expect(screen.getByText('No paired devices')).toBeInTheDocument()
  })

  test('renders protocol labels, transports, battery colours and signal for each device', () => {
    deviceState.list = [
      dev({
        id: 'a',
        name: 'iPhone',
        protocol: 'carplay',
        source: 'dongle',
        status: 'active',
        session: 1,
        batteryLevel: 50,
        batteryCharging: true,
        signalStrength: 3,
        carrierName: 'T-Mobile'
      }),
      dev({
        id: 'b',
        name: 'Pixel',
        protocol: 'androidauto',
        lastTransport: 'usb',
        status: 'offline',
        batteryLevel: 5
      }),
      dev({
        id: 'c',
        name: '',
        model: 'Model X',
        protocol: 'other' as never,
        lastTransport: 'wifi',
        status: 'available',
        session: 2,
        batteryLevel: 15,
        signalStrength: 2
      })
    ]
    render(<Devices />)
    expect(screen.getByText('CarPlay')).toBeInTheDocument()
    expect(screen.getByText('Android Auto')).toBeInTheDocument()
    expect(screen.getByText('Device')).toBeInTheDocument()
    expect(screen.getByText('iPhone')).toBeInTheDocument()
    expect(screen.getByText('Model X')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Not available')).toBeInTheDocument()
    expect(screen.getByText('Available')).toBeInTheDocument()
    expect(screen.getByText('T-Mobile')).toBeInTheDocument()
    expect(screen.getByTitle('50% charging')).toBeInTheDocument()
  })

  test('falls back to the id when neither name nor model is set', () => {
    deviceState.list = [dev({ id: 'bare-id', name: '', model: '' })]
    render(<Devices />)
    expect(screen.getByText('bare-id')).toBeInTheDocument()
  })

  test('selecting an available device navigates home when the pick succeeds', async () => {
    deviceState.list = [dev({ id: 'a', name: 'Pick', session: 1, status: 'available' })]
    render(<Devices />)
    fireEvent.click(screen.getByText('Pick'))
    await waitFor(() => expect(selectMock).toHaveBeenCalledWith('a'))
    expect(navigateMock).toHaveBeenCalledWith('/')
  })

  test('a failed pick does not navigate', async () => {
    selectMock.mockResolvedValue({ ok: false })
    deviceState.list = [dev({ id: 'a', name: 'Pick', session: 1 })]
    render(<Devices />)
    fireEvent.click(screen.getByText('Pick'))
    await waitFor(() => expect(selectMock).toHaveBeenCalled())
    expect(navigateMock).not.toHaveBeenCalled()
  })

  test('offline devices are not selectable', () => {
    deviceState.list = [dev({ id: 'a', name: 'Down', session: 1, status: 'offline' })]
    render(<Devices />)
    fireEvent.click(screen.getByText('Down'))
    expect(selectMock).not.toHaveBeenCalled()
  })

  test('delete routes dongle devices to the store and others to forgetDevice', () => {
    deviceState.list = [
      dev({ id: 'dg', name: 'Dongle', source: 'dongle', session: 1 }),
      dev({ id: 'bt', name: 'BtPhone', session: 2 })
    ]
    render(<Devices />)
    const deleteButtons = screen.getAllByLabelText('Delete device')
    fireEvent.click(deleteButtons[0])
    fireEvent.click(deleteButtons[1])
    expect(forgetDongleMock).toHaveBeenCalledWith('dg')
    expect(forgetMock).toHaveBeenCalledWith('bt')
  })
})
