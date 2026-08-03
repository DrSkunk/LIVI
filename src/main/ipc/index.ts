import { registerAppIpc } from '@main/ipc/app'
import { registerAudioIpc } from '@main/ipc/audio'
import { registerGamesIpc } from '@main/ipc/games'
import { registerMiniDspIpc } from '@main/ipc/minidsp'
import { registerSettingsIpc } from '@main/ipc/settings'
import { registerUpdateIpc } from '@main/ipc/update'
import { runtimeStateProps, ServicesProps } from '@main/types'

export function registerIpc(runtimeState: runtimeStateProps, services: ServicesProps) {
  registerAppIpc(runtimeState, services)
  registerAudioIpc()
  registerGamesIpc(runtimeState)
  registerMiniDspIpc(runtimeState)
  registerSettingsIpc(runtimeState)
  registerUpdateIpc(runtimeState, services)
}
