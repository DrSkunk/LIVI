import { EventEmitter } from 'node:events'
import { MessageHeader, MessageType } from '@projection/messages/common'
import {
  BluetoothPairedList,
  BoxInfo,
  BoxUpdateProgress,
  GnssData,
  Plugged,
  SoftwareVersion,
  Unplugged
} from '@projection/messages/readable'
import { DongleAdapter, type DongleAdapterDeps } from '../DongleAdapter'
import type { DongleDriver } from '../dongleDriver.js'

function header(type: MessageType): MessageHeader {
  return new MessageHeader(0, type)
}

function softwareVersion(v: string): SoftwareVersion {
  return new SoftwareVersion(header(MessageType.SoftwareVersion), Buffer.from(v, 'ascii'))
}

function boxInfo(settings: Record<string, unknown>): BoxInfo {
  return new BoxInfo(header(MessageType.BoxSettings), Buffer.from(JSON.stringify(settings), 'utf8'))
}

function plugged(phoneType: number): Plugged {
  const data = Buffer.alloc(4)
  data.writeUInt32LE(phoneType, 0)
  return new Plugged(header(MessageType.Plugged), data)
}

function deps(): { [K in keyof DongleAdapterDeps]: ReturnType<typeof vi.fn> } {
  return {
    emitMessage: vi.fn(),
    emitConnected: vi.fn(),
    emitDisconnected: vi.fn(),
    emitDevicePresence: vi.fn(),
    emitDeviceStatus: vi.fn(),
    emitDongleInfo: vi.fn(),
    emitDevices: vi.fn(),
    emitFwUpdateProgress: vi.fn(),
    emitBluetoothPairedList: vi.fn()
  }
}

function setup(): {
  dongle: EventEmitter
  d: ReturnType<typeof deps>
  adapter: DongleAdapter
} {
  const dongle = new EventEmitter()
  const d = deps()
  const adapter = new DongleAdapter(dongle as unknown as DongleDriver, d)
  adapter.wire()
  return { dongle, d, adapter }
}

describe('DongleAdapter wiring', () => {
  test('wire subscribes and unwire detaches', () => {
    const { dongle, d, adapter } = setup()
    dongle.emit('message', softwareVersion('2024.10.01'))
    expect(d.emitDongleInfo).toHaveBeenCalledTimes(1)
    adapter.unwire()
    dongle.emit('message', softwareVersion('2024.12.01'))
    expect(d.emitDongleInfo).toHaveBeenCalledTimes(1)
  })

  test('unknown message types are ignored', () => {
    const { dongle, d } = setup()
    dongle.emit(
      'message',
      new GnssData(header(MessageType.GnssData), Buffer.from('$GPRMC\0', 'ascii'))
    )
    dongle.emit('message', { not: 'a message' })
    expect(d.emitMessage).toHaveBeenCalledTimes(1)
    expect(d.emitConnected).not.toHaveBeenCalled()
  })
})

describe('dongle info aggregation', () => {
  test('software version updates the info once per change', () => {
    const { dongle, d, adapter } = setup()
    dongle.emit('message', softwareVersion('2024.10.01'))
    dongle.emit('message', softwareVersion('2024.10.01'))
    expect(d.emitDongleInfo).toHaveBeenCalledTimes(1)
    expect(adapter.getDongleInfo()).toEqual({ dongleFwVersion: '2024.10.01', boxInfo: undefined })
    dongle.emit('message', softwareVersion('2024.12.01'))
    expect(d.emitDongleInfo).toHaveBeenCalledTimes(2)
  })

  test('box info collects the device list, mac and settings', () => {
    const { dongle, d, adapter } = setup()
    dongle.emit(
      'message',
      boxInfo({
        btMacAddr: ' AA:BB:CC:DD:EE:FF ',
        DevList: [{ mac: '11:22:33:44:55:66', name: 'Phone' }],
        uuid: 'box-1'
      })
    )
    expect(adapter.getDongleConnectedMac()).toBe('AA:BB:CC:DD:EE:FF')
    expect(adapter.getDongleDevList()).toEqual([
      { mac: '11:22:33:44:55:66', name: 'Phone', source: 'dongle' }
    ])
    expect(d.emitDevices).toHaveBeenCalledTimes(1)
    expect(d.emitDongleInfo).toHaveBeenCalledTimes(1)
  })

  test('box info without a device list or mac keeps prior state', () => {
    const { dongle, adapter } = setup()
    dongle.emit('message', boxInfo({ btMacAddr: '  ', uuid: 'box-1' }))
    expect(adapter.getDongleConnectedMac()).toBe('')
    expect(adapter.getDongleDevList()).toEqual([])
  })

  test('later box info values never overwrite meaningful existing ones', () => {
    const { dongle, adapter } = setup()
    dongle.emit('message', boxInfo({ uuid: 'box-1', name: 'Dongle' }))
    dongle.emit('message', boxInfo({ uuid: '', name: 'Renamed', extra: 1, empty: '' }))
    expect(adapter.getDongleInfo().boxInfo).toEqual({
      uuid: 'box-1',
      name: 'Renamed',
      extra: 1,
      empty: ''
    })
  })

  test('unchanged box info does not re-emit', () => {
    const { dongle, d } = setup()
    dongle.emit('message', boxInfo({ uuid: 'box-1' }))
    dongle.emit('message', boxInfo({ uuid: 'box-1' }))
    expect(d.emitDongleInfo).toHaveBeenCalledTimes(1)
    expect(d.emitDevices).toHaveBeenCalledTimes(2)
  })

  test('non-object settings payloads merge defensively', () => {
    const { dongle, adapter } = setup()
    const rawBox = (json: string) =>
      new BoxInfo(header(MessageType.BoxSettings), Buffer.from(json, 'utf8'))

    dongle.emit('message', rawBox('null'))
    expect(adapter.getDongleInfo().boxInfo).toBeUndefined()

    dongle.emit('message', rawBox('"unparsable"'))
    expect(adapter.getDongleInfo().boxInfo).toBe('unparsable')

    const nested = '{"uuid":"from-string"}'
    dongle.emit('message', rawBox('"{\\"uuid\\":\\"from-string\\"}"'))
    expect(adapter.getDongleInfo().boxInfo).toBe(nested)

    dongle.emit('message', rawBox('"42"'))
    expect(adapter.getDongleInfo().boxInfo).toBe(nested)

    dongle.emit('message', rawBox('" "'))
    expect(adapter.getDongleInfo().boxInfo).toBe(nested)

    dongle.emit('message', rawBox('"null"'))
    expect(adapter.getDongleInfo().boxInfo).toBe(nested)

    dongle.emit('message', rawBox('7'))
    expect(adapter.getDongleInfo().boxInfo).toBe(nested)
  })

  test('null-valued settings keys are only adopted when absent', () => {
    const { dongle, adapter } = setup()
    dongle.emit('message', boxInfo({ uuid: 'box-1' }))
    dongle.emit('message', boxInfo({ uuid: null, fresh: null }))
    expect(adapter.getDongleInfo().boxInfo).toEqual({ uuid: 'box-1', fresh: null })
  })

  test('an unstringifiable box info falls back to String()', () => {
    const { dongle, d, adapter } = setup()
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const msg = boxInfo({ uuid: 'box-1' })
    ;(msg as unknown as { settings: unknown }).settings = cyclic
    dongle.emit('message', msg)
    dongle.emit('message', softwareVersion('v1'))
    expect(d.emitDongleInfo).toHaveBeenCalledTimes(2)
    expect(adapter.getDongleInfo().boxInfo).toBe(cyclic)
  })
})

describe('session events', () => {
  test('gnss data is forwarded as a message', () => {
    const { dongle, d } = setup()
    const gnss = new GnssData(header(MessageType.GnssData), Buffer.from('$GPGGA,x\0', 'ascii'))
    dongle.emit('message', gnss)
    expect(d.emitMessage).toHaveBeenCalledWith(gnss)
  })

  test('the paired list is cached and forwarded raw', () => {
    const { dongle, d, adapter } = setup()
    dongle.emit(
      'message',
      new BluetoothPairedList(header(MessageType.BluetoothPairedList), Buffer.from('AABB,CCDD\0'))
    )
    expect(adapter.getDonglePairedRaw()).toBe('AABB,CCDD')
    expect(d.emitBluetoothPairedList).toHaveBeenCalledWith('AABB,CCDD')
  })

  test('plugged reports the phone type', () => {
    const { dongle, d } = setup()
    dongle.emit('message', plugged(3))
    expect(d.emitConnected).toHaveBeenCalledWith(3)
  })

  test('unplugged clears the session state and re-emits', () => {
    const { dongle, d, adapter } = setup()
    dongle.emit(
      'message',
      boxInfo({ btMacAddr: 'AA:BB:CC:DD:EE:FF', DevList: [{ mac: '11' }], uuid: 'box-1' })
    )
    dongle.emit('message', new Unplugged(header(MessageType.Unplugged)))

    expect(adapter.getDongleConnectedMac()).toBe('')
    expect(adapter.getDongleDevList()).toEqual([])
    expect(d.emitDisconnected).toHaveBeenCalledTimes(1)
    expect(d.emitDongleInfo).toHaveBeenLastCalledWith({
      dongleFwVersion: undefined,
      boxInfo: expect.objectContaining({ btMacAddr: '', uuid: 'box-1' })
    })
    expect(d.emitDevices).toHaveBeenCalledTimes(2)
  })

  test('unplugged without prior box info leaves it untouched', () => {
    const { dongle, d } = setup()
    dongle.emit('message', new Unplugged(header(MessageType.Unplugged)))
    expect(d.emitDongleInfo).toHaveBeenCalledWith({
      dongleFwVersion: undefined,
      boxInfo: undefined
    })
  })

  test('firmware update progress is forwarded', () => {
    const { dongle, d } = setup()
    const data = Buffer.alloc(4)
    data.writeInt32LE(42, 0)
    dongle.emit('message', new BoxUpdateProgress(header(MessageType.BoxUpdateProgress), data))
    expect(d.emitFwUpdateProgress).toHaveBeenCalledWith(42)
  })
})
