import { registerIpcHandle } from '@main/ipc/register'
import { isClusterDisplayed } from '@shared/utils'
import { BrowserWindow } from 'electron'
import { SendCommand } from '../messages/sendable'
import type { ProjectionIpcHost } from './types'

type Deps = Pick<
  ProjectionIpcHost,
  | 'getConfig'
  | 'setClusterRequested'
  | 'isMainClusterWindow'
  | 'isClusterRequested'
  | 'setClusterVisible'
  | 'resetLastClusterVideoSize'
  | 'getLastClusterVideoSize'
  | 'getClusterTargetWebContents'
  | 'send'
>

export function registerClusterIpc(host: Deps): void {
  registerIpcHandle('cluster:request', async (evt, enabled: boolean) => {
    const wanted = Boolean(enabled) && isClusterDisplayed(host.getConfig())
    host.setClusterRequested(evt.sender.id, wanted)
    if (host.isMainClusterWindow(evt.sender.id)) host.setClusterVisible(wanted)

    if (!wanted) {
      if (!host.isClusterRequested()) host.resetLastClusterVideoSize()
      return { ok: true, enabled: false }
    }

    const size = host.getLastClusterVideoSize()
    if (size) {
      for (const wc of host.getClusterTargetWebContents()) {
        try {
          wc.send('cluster-video-resolution', { width: size.width, height: size.height })
        } catch {
          /* detached webContents */
        }
      }
    }

    try {
      host.send(new SendCommand('requestClusterStreamFocus'))
    } catch {
      // ignore
    }

    return { ok: true, enabled: true }
  })

  // macOS only: Chromium leaves stale pixels in a transparent window's see-through regions, so the
  // cluster plane stays hidden behind a ghost until the surface is recreated. A 1px size nudge of
  // the requesting window forces that recreation.
  registerIpcHandle('cluster:repaint-nudge', async (evt) => {
    if (process.platform !== 'darwin') return { ok: false }
    const win = BrowserWindow.fromWebContents(evt.sender)
    if (!win || win.isDestroyed()) return { ok: false }
    const [w, h] = win.getSize()
    win.setSize(w, h + 1)
    setTimeout(() => {
      if (!win.isDestroyed()) win.setSize(w, h)
    }, 60)
    return { ok: true }
  })
}
