export const DEFAULT_ROM_DIRECTORY = '~/Games/roms'
export const DEFAULT_PLAYLIST_DIRECTORY = '~/.config/retroarch/playlists'
export const DEFAULT_THUMBNAIL_DIRECTORY = '~/.config/retroarch/thumbnails'

export type GamesConfig = {
  enabled: boolean
  retroArchPath: string
  playlistDirectory: string
  thumbnailDirectory: string
}

export type BluetoothControllerDevice = {
  mac: string
  name: string
  paired: boolean
  connected: boolean
}

export type GameLibraryItem = {
  id: string
  title: string
  system: string
  hasThumbnail: boolean
}

export type GameStatus =
  | { state: 'idle'; gameId?: string; exitCode?: number | null; signal?: string | null }
  | { state: 'launching'; gameId?: string }
  | { state: 'running'; gameId?: string }
  | { state: 'error'; gameId?: string; message: string }
