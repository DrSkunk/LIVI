import type { Mock } from 'vitest'

const { listAudioDevices, listPaired } = vi.hoisted(() => ({
  listAudioDevices: vi.fn(),
  listPaired: vi.fn()
}))

vi.mock('@main/ipc/register', () => ({
  registerIpcHandle: vi.fn()
}))

vi.mock('@main/services/audio/AudioDeviceEnumerator', () => ({
  listAudioDevices: (...args: unknown[]) => listAudioDevices(...args)
}))

vi.mock('@main/services/projection/bt/BluezDeviceClient', () => ({
  BluezDeviceClient: vi.fn().mockImplementation(function () {
    return { listPaired: (...args: unknown[]) => listPaired(...args) }
  })
}))

import { registerIpcHandle } from '@main/ipc/register'
import { registerAudioIpc } from '../audio'

const AUDIO_COD = 0x0400 // major class 0x04 = Audio/Video

function handlerFor(channel: string): () => Promise<unknown> {
  const call = (registerIpcHandle as Mock).mock.calls.find((c) => c[0] === channel)
  return call![1] as () => Promise<unknown>
}

const originalPlatform = process.platform
const setPlatform = (value: string): void => {
  Object.defineProperty(process, 'platform', { value, configurable: true })
}

beforeEach(() => {
  ;(registerIpcHandle as Mock).mockClear()
  listAudioDevices.mockReset()
  listPaired.mockReset()
  setPlatform('linux')
})

afterEach(() => {
  setPlatform(originalPlatform)
})

describe('registerAudioIpc', () => {
  test('registers the listSinks and listSources handlers', () => {
    registerAudioIpc()
    const channels = (registerIpcHandle as Mock).mock.calls.map((c) => c[0])
    expect(channels).toContain('audio:listSinks')
    expect(channels).toContain('audio:listSources')
  })
})

describe('mixedAudioDevices (via the listSinks handler)', () => {
  test('appends paired BT audio not present locally as offline entries', async () => {
    listAudioDevices.mockResolvedValue([
      { id: 'alsa_output.builtin', name: 'Speakers', isDefault: true }
    ])
    listPaired.mockResolvedValue([{ mac: 'AA:BB:CC:DD:EE:FF', name: 'Headset', class: AUDIO_COD }])

    registerAudioIpc()
    const devices = (await handlerFor('audio:listSinks')()) as Array<Record<string, unknown>>

    expect(devices).toHaveLength(2)
    expect(devices[1]).toMatchObject({
      id: 'bluez_output.AA_BB_CC_DD_EE_FF.0',
      name: 'Headset',
      offline: true
    })
  })

  test('filters out paired devices that are not audio class-of-device', async () => {
    listAudioDevices.mockResolvedValue([])
    listPaired.mockResolvedValue([{ mac: 'AA:BB:CC:DD:EE:FF', name: 'Mouse', class: 0x0580 }])

    registerAudioIpc()
    const devices = (await handlerFor('audio:listSinks')()) as unknown[]

    expect(devices).toHaveLength(0)
  })

  test('collapses multiple bluez profile nodes for the same MAC', async () => {
    listAudioDevices.mockResolvedValue([
      { id: 'bluez_output.AA_BB_CC_DD_EE_FF.a2dp-sink', name: 'Headset A2DP', isDefault: false },
      { id: 'bluez_output.AA_BB_CC_DD_EE_FF.headset', name: 'Headset HFP', isDefault: false }
    ])
    listPaired.mockResolvedValue([])

    registerAudioIpc()
    const devices = (await handlerFor('audio:listSinks')()) as unknown[]

    expect(devices).toHaveLength(1)
  })

  test('does not add an offline entry when the MAC is already live', async () => {
    listAudioDevices.mockResolvedValue([
      { id: 'bluez_output.AA_BB_CC_DD_EE_FF.0', name: 'Headset', isDefault: false }
    ])
    listPaired.mockResolvedValue([{ mac: 'AA:BB:CC:DD:EE:FF', name: 'Headset', class: AUDIO_COD }])

    registerAudioIpc()
    const devices = (await handlerFor('audio:listSinks')()) as unknown[]

    expect(devices).toHaveLength(1)
  })

  test('skips the BT lookup entirely off Linux', async () => {
    setPlatform('darwin')
    listAudioDevices.mockResolvedValue([
      { id: 'osx-builtin', name: 'MacBook Speakers', isDefault: true }
    ])

    registerAudioIpc()
    const devices = (await handlerFor('audio:listSinks')()) as unknown[]

    expect(devices).toHaveLength(1)
    expect(listPaired).not.toHaveBeenCalled()
  })

  test('returns the local list when the BT sock throws', async () => {
    listAudioDevices.mockResolvedValue([
      { id: 'alsa_output.builtin', name: 'Speakers', isDefault: true }
    ])
    listPaired.mockRejectedValue(new Error('sock down'))

    registerAudioIpc()
    const devices = (await handlerFor('audio:listSinks')()) as unknown[]

    expect(devices).toHaveLength(1)
  })

  test('filters paired devices without a usable class-of-device', async () => {
    listAudioDevices.mockResolvedValue([])
    listPaired.mockResolvedValue([
      { mac: 'AA:BB:CC:DD:EE:01', name: 'NoClass' },
      { mac: 'AA:BB:CC:DD:EE:02', name: 'ZeroClass', class: 0 },
      { mac: 'AA:BB:CC:DD:EE:03', name: 'NegClass', class: -1 }
    ])

    registerAudioIpc()
    const devices = (await handlerFor('audio:listSinks')()) as unknown[]

    expect(devices).toHaveLength(0)
  })

  test('falls back to the MAC when a paired device has no name', async () => {
    listAudioDevices.mockResolvedValue([])
    listPaired.mockResolvedValue([{ mac: 'AA:BB:CC:DD:EE:FF', name: '', class: AUDIO_COD }])

    registerAudioIpc()
    const devices = (await handlerFor('audio:listSinks')()) as Array<Record<string, unknown>>

    expect(devices[0].name).toBe('AA:BB:CC:DD:EE:FF')
  })

  test('does not add an offline entry when a live device carries the same name', async () => {
    listAudioDevices.mockResolvedValue([
      { id: 'alsa_output.usb-dock', name: ' Headset ', isDefault: false }
    ])
    listPaired.mockResolvedValue([{ mac: 'AA:BB:CC:DD:EE:FF', name: 'headset', class: AUDIO_COD }])

    registerAudioIpc()
    const devices = (await handlerFor('audio:listSinks')()) as unknown[]

    expect(devices).toHaveLength(1)
  })

  test('offline sources get a bluez_input id with a colon MAC', async () => {
    listAudioDevices.mockResolvedValue([])
    listPaired.mockResolvedValue([{ mac: 'aa:bb:cc:dd:ee:ff', name: 'Car Mic', class: AUDIO_COD }])

    registerAudioIpc()
    const devices = (await handlerFor('audio:listSources')()) as Array<Record<string, unknown>>

    expect(devices[0]).toMatchObject({
      id: 'bluez_input.AA:BB:CC:DD:EE:FF',
      name: 'Car Mic',
      offline: true
    })
  })
})
