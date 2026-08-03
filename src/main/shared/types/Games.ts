export type GamesConfig = {
  enabled: boolean
  retroArchPath: string
  playlistDirectory: string
  thumbnailDirectory: string
}

export type GameLibraryItem = {
  id: string
  title: string
  system: string
  hasThumbnail: boolean
}

export type GameStatus =
  | { state: 'idle'; gameId?: string; exitCode?: number | null; signal?: string | null }
  | { state: 'launching'; gameId: string }
  | { state: 'running'; gameId: string }
  | { state: 'error'; gameId?: string; message: string }
