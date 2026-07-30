import { registerIpcHandle } from '@main/ipc/register'
import { PhoneWorkMode } from '@shared/types'
import { SendForgetBluetoothAddr } from '../messages/sendable'
import type { ProjectionIpcHost } from './types'

type Deps = Pick<
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

export function registerBluetoothIpc(host: Deps): void {
  registerIpcHandle('projection-bt-pairedlist-set', async (_evt, listText: string) => {
    if (!host.isStarted()) return { ok: false }
    if (host.isUsingDongle()) {
      const ok = await host.sendBluetoothPairedList(String(listText ?? ''))
      return { ok }
    }
    return { ok: true }
  })

  registerIpcHandle('projection-bt-connect-device', async (_evt, mac: string) => {
    if (!host.isStarted()) return { ok: false }
    const btMac = String(mac ?? '').trim()
    if (!btMac) return { ok: false }

    if (host.isUsingAa()) {
      try {
        const resp = await host.connectBt(btMac)
        if (resp.ok) host.refreshBtPaired()
        return resp
      } catch (e) {
        return { ok: false, error: (e as Error).message }
      }
    }

    const boxInfo = host.getBoxInfo()
    const devList = Array.isArray((boxInfo as { DevList?: unknown[] } | undefined)?.DevList)
      ? (boxInfo as { DevList: Array<{ id?: string; type?: string }> }).DevList
      : []
    const devEntry = devList.find((entry) => String(entry?.id ?? '').trim() === btMac)
    const targetPhoneWorkMode =
      devEntry?.type === 'AndroidAuto' ? PhoneWorkMode.Android : PhoneWorkMode.CarPlay

    host.setPendingStartupConnectTarget({ btMac, phoneWorkMode: targetPhoneWorkMode })
    return { ok: true }
  })

  registerIpcHandle('projection-bt-forget-device', async (_evt, mac: string) => {
    if (!host.isStarted()) return { ok: false }
    const btMac = String(mac ?? '').trim()
    if (!btMac) return { ok: false }

    const ok = await host.sendToDongle(new SendForgetBluetoothAddr(btMac))
    return { ok: Boolean(ok) }
  })
}
