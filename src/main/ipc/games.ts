import { registerIpcHandle, registerIpcOn } from '@main/ipc/register'
import { BluetoothControllerService } from '@main/services/games/BluetoothControllerService'
import { GameService } from '@main/services/games/GameService'
import type { runtimeStateProps } from '@main/types'

export function registerGamesIpc(runtimeState: runtimeStateProps): void {
  const games = new GameService(runtimeState)
  const controllers = new BluetoothControllerService()

  registerIpcHandle('games:library', () => games.getLibrary())
  registerIpcHandle('games:import-roms', () => games.importRoms())
  registerIpcHandle('games:thumbnail', (_event, gameId: string) => games.getThumbnail(gameId))
  registerIpcHandle('games:status', () => games.getStatus())
  registerIpcHandle('games:open-retroarch', () => games.openRetroArch())
  registerIpcHandle('games:launch', (_event, gameId: string) => games.launch(gameId))
  registerIpcHandle('games:controllers-list', () => controllers.list())
  registerIpcHandle('games:controllers-scan', () => controllers.scan())
  registerIpcHandle('games:controllers-pair', (_event, mac: string) => controllers.pair(mac))
  registerIpcOn('games:stop', () => games.stop())
}
