import { registerIpcHandle, registerIpcOn } from '@main/ipc/register'
import { GameService } from '@main/services/games/GameService'
import type { runtimeStateProps } from '@main/types'

export function registerGamesIpc(runtimeState: runtimeStateProps): void {
  const games = new GameService(runtimeState)

  registerIpcHandle('games:library', () => games.getLibrary())
  registerIpcHandle('games:thumbnail', (_event, gameId: string) => games.getThumbnail(gameId))
  registerIpcHandle('games:status', () => games.getStatus())
  registerIpcHandle('games:launch', (_event, gameId: string) => games.launch(gameId))
  registerIpcOn('games:stop', () => games.stop())
}
