import type { Mocked } from 'vitest'

type IpcHandler = (evt: unknown, ...args: unknown[]) => unknown
const handlers = new Map<string, IpcHandler>()

vi.mock('@main/ipc/register', () => ({
  registerIpcHandle: (channel: string, handler: IpcHandler) => {
    handlers.set(channel, handler)
  },
  registerIpcOn: vi.fn()
}))

import { SendForgetBluetoothAddr } from '../../messages/sendable'
import { registerBluetoothIpc } from '../bluetooth'
import type { ProjectionIpcHost } from '../types'

type BtHost = Pick<
  ProjectionIpcHost,
  | 'isStarted'
  | 'isUsingDongle'
  | 'isUsingAa'
  | 'sendToDongle'
  | 'sendBluetoothPairedList'
  | 'connectBt'
  | 'refreshBtPaired'
  | 'getBoxInfo'
  | 'setPendingStartupConnectTarget'
>

function fakeHost(over: Partial<BtHost> = {}): Mocked<BtHost> {
  return {
    isStarted: vi.fn(() => true),
    isUsingDongle: vi.fn(() => false),
    isUsingAa: vi.fn(() => false),
    sendToDongle: vi.fn(async () => true),
    sendBluetoothPairedList: vi.fn(async () => true),
    connectBt: vi.fn(async () => ({ ok: true })),
    refreshBtPaired: vi.fn(),
    getBoxInfo: vi.fn(() => undefined),
    setPendingStartupConnectTarget: vi.fn(),
    ...over
  } as Mocked<BtHost>
}

beforeEach(async () => {
  handlers.clear()
})

describe('bluetooth ipc — projection-bt-pairedlist-set', () => {
  test('returns { ok: false } when not started', async () => {
    const host = fakeHost({ isStarted: vi.fn(() => false) })
    registerBluetoothIpc(host)
    const h = handlers.get('projection-bt-pairedlist-set')!
    await expect(h(null, 'abc')).resolves.toEqual({ ok: false })
  })

  test('sends to dongle when using dongle', async () => {
    const host = fakeHost({ isUsingDongle: vi.fn(() => true) })
    registerBluetoothIpc(host)
    const h = handlers.get('projection-bt-pairedlist-set')!
    await expect(h(null, 'abc')).resolves.toEqual({ ok: true })
    expect(host.sendBluetoothPairedList).toHaveBeenCalledWith('abc')
  })

  test('no-op on AA path', async () => {
    const host = fakeHost({ isUsingDongle: vi.fn(() => false) })
    registerBluetoothIpc(host)
    const h = handlers.get('projection-bt-pairedlist-set')!
    await expect(h(null, 'abc')).resolves.toEqual({ ok: true })
    expect(host.sendBluetoothPairedList).not.toHaveBeenCalled()
  })
})

describe('bluetooth ipc — projection-bt-connect-device', () => {
  test('rejects when not started or mac empty', async () => {
    const host = fakeHost({ isStarted: vi.fn(() => false) })
    registerBluetoothIpc(host)
    const h = handlers.get('projection-bt-connect-device')!
    await expect(h(null, 'AA:BB')).resolves.toEqual({ ok: false })

    const h2 = (() => {
      handlers.clear()
      registerBluetoothIpc(fakeHost())
      return handlers.get('projection-bt-connect-device')!
    })()
    await expect(h2(null, '   ')).resolves.toEqual({ ok: false })
  })

  test('AA path delegates to connectBt and refreshes on success', async () => {
    const host = fakeHost({
      isUsingAa: vi.fn(() => true),
      connectBt: vi.fn(async () => ({ ok: true }))
    })
    registerBluetoothIpc(host)
    const h = handlers.get('projection-bt-connect-device')!
    await expect(h(null, 'AA:BB')).resolves.toEqual({ ok: true })
    expect(host.refreshBtPaired).toHaveBeenCalled()
  })

  test('AA path: connectBt throwing surfaces as { ok:false, error }', async () => {
    const host = fakeHost({
      isUsingAa: vi.fn(() => true),
      connectBt: vi.fn(async () => {
        throw new Error('busy')
      })
    })
    registerBluetoothIpc(host)
    const h = handlers.get('projection-bt-connect-device')!
    await expect(h(null, 'AA:BB')).resolves.toEqual({ ok: false, error: 'busy' })
  })

  test('dongle path: AndroidAuto entry → Android phoneWorkMode', async () => {
    const host = fakeHost({
      getBoxInfo: vi.fn(function () {
        return { DevList: [{ id: 'AA:BB', type: 'AndroidAuto' }] }
      })
    })
    registerBluetoothIpc(host)
    const h = handlers.get('projection-bt-connect-device')!
    await expect(h(null, 'AA:BB')).resolves.toEqual({ ok: true })
    expect(host.setPendingStartupConnectTarget).toHaveBeenCalledWith({
      btMac: 'AA:BB',
      phoneWorkMode: expect.any(Number)
    })
  })

  test('dongle path: non-AA entry → CarPlay phoneWorkMode', async () => {
    const host = fakeHost({
      getBoxInfo: vi.fn(function () {
        return { DevList: [{ id: 'CC:DD', type: 'CarPlay' }] }
      })
    })
    registerBluetoothIpc(host)
    const h = handlers.get('projection-bt-connect-device')!
    await h(null, 'CC:DD')
    const arg = host.setPendingStartupConnectTarget.mock.calls[0][0]
    expect(arg).not.toBeNull()
  })
})

describe('bluetooth ipc — projection-bt-forget-device', () => {
  test('rejects when not started or mac empty', async () => {
    const host = fakeHost({ isStarted: vi.fn(() => false) })
    registerBluetoothIpc(host)
    const h = handlers.get('projection-bt-forget-device')!
    await expect(h(null, 'AA:BB')).resolves.toEqual({ ok: false })
  })

  test('sends SendForgetBluetoothAddr to the dongle', async () => {
    const host = fakeHost()
    registerBluetoothIpc(host)
    const h = handlers.get('projection-bt-forget-device')!
    await expect(h(null, 'AA:BB')).resolves.toEqual({ ok: true })
    expect(host.sendToDongle).toHaveBeenCalledWith(expect.any(SendForgetBluetoothAddr))
  })

  test('returns { ok: false } when sendToDongle resolves falsy', async () => {
    const host = fakeHost({ sendToDongle: vi.fn(async () => false) })
    registerBluetoothIpc(host)
    const h = handlers.get('projection-bt-forget-device')!
    await expect(h(null, 'AA:BB')).resolves.toEqual({ ok: false })
  })

  test('forget rejects an empty mac', async () => {
    const host = fakeHost()
    registerBluetoothIpc(host)
    const h = handlers.get('projection-bt-forget-device')!
    await expect(h(null, '')).resolves.toEqual({ ok: false })
    await expect(h(null, '   ')).resolves.toEqual({ ok: false })
  })
})

describe('bluetooth ipc — edge cases', () => {
  test('pairedlist-set tolerates null listText payload', async () => {
    const host = fakeHost({ isUsingDongle: vi.fn(() => true) })
    registerBluetoothIpc(host)
    const h = handlers.get('projection-bt-pairedlist-set')!
    await h(null, null as unknown as string)
    expect(host.sendBluetoothPairedList).toHaveBeenCalledWith('')
  })

  test('connect AA-path: refresh not called when connectBt resolves !ok', async () => {
    const host = fakeHost({
      isUsingAa: vi.fn(() => true),
      connectBt: vi.fn(async () => ({ ok: false, error: 'no peer' }))
    })
    registerBluetoothIpc(host)
    const h = handlers.get('projection-bt-connect-device')!
    await expect(h(null, 'AA:BB')).resolves.toEqual({ ok: false, error: 'no peer' })
    expect(host.refreshBtPaired).not.toHaveBeenCalled()
  })

  test('connect dongle-path: empty BoxInfo or non-array DevList falls back to empty list', async () => {
    const host = fakeHost({ getBoxInfo: vi.fn(() => undefined) })
    registerBluetoothIpc(host)
    const h = handlers.get('projection-bt-connect-device')!
    await expect(h(null, 'AA:BB')).resolves.toEqual({ ok: true })
    expect(host.setPendingStartupConnectTarget).toHaveBeenCalled()
  })

  test('connect dongle-path: BoxInfo with non-array DevList shape', async () => {
    const host = fakeHost({
      getBoxInfo: vi.fn(function () {
        return { DevList: 'not-an-array' }
      })
    })
    registerBluetoothIpc(host)
    const h = handlers.get('projection-bt-connect-device')!
    await expect(h(null, 'AA:BB')).resolves.toEqual({ ok: true })
  })

  test('connect rejects empty mac (whitespace-only)', async () => {
    const host = fakeHost()
    registerBluetoothIpc(host)
    const h = handlers.get('projection-bt-connect-device')!
    await expect(h(null, '   ')).resolves.toEqual({ ok: false })
  })

  test('connect tolerates a nullish mac payload', async () => {
    const host = fakeHost()
    registerBluetoothIpc(host)
    const h = handlers.get('projection-bt-connect-device')!
    await expect(h(null, undefined)).resolves.toEqual({ ok: false })
    await expect(h(null, null)).resolves.toEqual({ ok: false })
  })

  test('connect dongle-path skips DevList entries without an id', async () => {
    const host = fakeHost({
      getBoxInfo: vi.fn(function () {
        return { DevList: [{ type: 'AndroidAuto' }, { id: 'AA:BB', type: 'AndroidAuto' }] }
      })
    })
    registerBluetoothIpc(host)
    const h = handlers.get('projection-bt-connect-device')!
    await expect(h(null, 'AA:BB')).resolves.toEqual({ ok: true })
    expect(host.setPendingStartupConnectTarget).toHaveBeenCalledWith({
      btMac: 'AA:BB',
      phoneWorkMode: expect.any(Number)
    })
  })

  test('forget tolerates a nullish mac payload', async () => {
    const host = fakeHost()
    registerBluetoothIpc(host)
    const h = handlers.get('projection-bt-forget-device')!
    await expect(h(null, undefined)).resolves.toEqual({ ok: false })
  })
})
