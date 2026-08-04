import type {
  BluetoothControllerDevice,
  GameImportResult,
  GameLibraryItem,
  GameStatus,
  MiniDspStatus
} from '@shared/types'

export type UpdateEvent =
  | {
      phase:
        | 'start'
        | 'ready'
        | 'mounting'
        | 'copying'
        | 'unmounting'
        | 'installing'
        | 'relaunching'
    }
  | { phase: 'error'; message?: string }

export type UpdateProgress = {
  phase: 'download'
  percent?: number
  received?: number
  total?: number
}

export interface MiniDspApi {
  getStatus(): Promise<MiniDspStatus>
  setVolume(volumeDb: number): Promise<void>
  setBassGain(gainDb: number): Promise<void>
  selectPreset(preset: number): Promise<void>
}

export interface GamesApi {
  getLibrary(): Promise<GameLibraryItem[]>
  importRoms(): Promise<GameImportResult>
  getThumbnail(gameId: string): Promise<string | null>
  getStatus(): Promise<GameStatus>
  openRetroArch(): Promise<{ ok: true }>
  launch(gameId: string): Promise<{ ok: true }>
  listControllers(): Promise<BluetoothControllerDevice[]>
  scanControllers(): Promise<BluetoothControllerDevice[]>
  pairController(mac: string): Promise<{ ok: true }>
  stop(): void
  onStatus(callback: (status: GameStatus) => void): () => void
}

export interface AppApi {
  platform: NodeJS.Platform
  compositor: boolean
  getVersion(): Promise<string>
  listDisplayModes(): Promise<string[]>
  listWifiChannels(): Promise<number[]>
  listWifiCountryCodes(): Promise<string[]>
  listWifiInterfaces(): Promise<string[]>
  listBtAdapters(): Promise<string[]>
  getLatestRelease(): Promise<{
    version?: string
    url?: string
    commit?: string
    run?: string
  }>
  performUpdate(imageUrl?: string): Promise<void>
  onUpdateEvent(callback: (payload: UpdateEvent) => void): () => void
  onUpdateProgress(callback: (payload: UpdateProgress) => void): () => void
  resetDongleIcons(): Promise<{
    dongleIcon120?: string
    dongleIcon180?: string
    dongleIcon256?: string
  }>
  beginInstall(): Promise<void>
  abortUpdate(): Promise<void>
  quitApp(): Promise<void>
  restartApp(): Promise<void>
  openExternal(url: string): Promise<{ ok: boolean; error?: string }>
  notifyUserActivity(): void
  broadcastMediaKey(command: string): void
  onMediaKey(handler: (command: string) => void): () => void
}
