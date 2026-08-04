import { type ChildProcess, spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { extname } from 'node:path'
import type { runtimeStateProps } from '@main/types'
import { getMainWindow } from '@main/window/createWindow'
import type { GameImportResult, GameLibraryItem, GameStatus } from '@shared/types'
import { app, BrowserWindow } from 'electron'
import { type GameRecord, scanGameLibrary } from './libraryScanner'
import { importRomLibrary } from './RomImporter'

const THUMBNAIL_MAX_BYTES = 8 * 1024 * 1024

function mimeFor(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    default:
      return 'image/png'
  }
}

export class GameService {
  private child: ChildProcess | null = null
  private library = new Map<string, GameRecord>()
  private status: GameStatus = { state: 'idle' }
  private restoring = false
  private importPromise: Promise<GameImportResult> | null = null

  constructor(private readonly runtimeState: runtimeStateProps) {
    app.on('before-quit', () => this.child?.kill())
  }

  async getLibrary(): Promise<GameLibraryItem[]> {
    if (!this.runtimeState.config.games.enabled) {
      this.library.clear()
      return []
    }

    const records = await scanGameLibrary(this.runtimeState.config.games)
    this.library = new Map(records.map((game) => [game.id, game]))
    return records.map(({ id, title, system, hasThumbnail }) => ({
      id,
      title,
      system,
      hasThumbnail
    }))
  }

  getStatus(): GameStatus {
    return this.status
  }

  importRoms(): Promise<GameImportResult> {
    if (!this.runtimeState.config.games.enabled) {
      return Promise.reject(new Error('Games screen is disabled'))
    }
    if (this.importPromise) return this.importPromise

    const promise = importRomLibrary(this.runtimeState.config.games)
      .then((result) => {
        this.library.clear()
        return result
      })
      .finally(() => {
        if (this.importPromise === promise) this.importPromise = null
      })
    this.importPromise = promise
    return promise
  }

  async getThumbnail(gameId: string): Promise<string | null> {
    const game = await this.resolveGame(gameId)
    if (!game.thumbnailPath) return null

    const stat = await fs.stat(game.thumbnailPath)
    if (!stat.isFile() || stat.size > THUMBNAIL_MAX_BYTES) return null
    const image = await fs.readFile(game.thumbnailPath)
    return `data:${mimeFor(game.thumbnailPath)};base64,${image.toString('base64')}`
  }

  async openRetroArch(): Promise<{ ok: true }> {
    return this.startRetroArch(['--fullscreen', '--menu'])
  }

  async launch(gameId: string): Promise<{ ok: true }> {
    if (!this.runtimeState.config.games.enabled) throw new Error('Games screen is disabled')
    const game = await this.resolveGame(gameId)
    const args = ['--fullscreen']
    if (game.corePath) args.push('-L', game.corePath)
    args.push(game.romPath)
    return this.startRetroArch(args, gameId)
  }

  private startRetroArch(args: string[], gameId?: string): Promise<{ ok: true }> {
    if (!this.runtimeState.config.games.enabled) throw new Error('Games screen is disabled')
    if (this.child) throw new Error('RetroArch is already running')

    const executable = this.runtimeState.config.games.retroArchPath.trim()
    if (!executable) throw new Error('RetroArch executable is not configured')

    const launchArgs = [...args]
    const bounds = getMainWindow()?.getContentBounds()
    if (bounds && bounds.width > 0 && bounds.height > 0) {
      // Some Wayland compositors ignore RetroArch's initial fullscreen request.
      // Matching the host output still gives a borderless screen-filling surface.
      launchArgs.splice(1, 0, `--size=${Math.round(bounds.width)}x${Math.round(bounds.height)}`)
    }

    this.setStatus({ state: 'launching', gameId })

    return new Promise((resolve, reject) => {
      const child = spawn(executable, launchArgs, {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      this.child = child
      let spawned = false

      child.stdout?.on('data', (chunk) => console.log(`[retroarch] ${String(chunk).trimEnd()}`))
      child.stderr?.on('data', (chunk) => console.error(`[retroarch] ${String(chunk).trimEnd()}`))

      child.once('spawn', () => {
        spawned = true
        // Keep LIVI mapped behind RetroArch. Hiding an Electron Wayland surface
        // makes Cage drop it; remapping after RetroArch exits can then leave only
        // the compositor's black background.
        this.setStatus({ state: 'running', gameId })
        resolve({ ok: true })
      })

      child.once('error', (error) => {
        this.child = null
        this.setStatus({ state: 'error', gameId, message: error.message })
        this.restoreLivi()
        if (!spawned) reject(error)
      })

      child.once('close', (exitCode, signal) => {
        this.child = null
        this.setStatus({ state: 'idle', gameId, exitCode, signal })
        this.restoreLivi()
      })
    })
  }

  stop(): void {
    this.child?.kill()
  }

  private async resolveGame(gameId: string): Promise<GameRecord> {
    let game = this.library.get(gameId)
    if (!game) {
      await this.getLibrary()
      game = this.library.get(gameId)
    }
    if (!game) throw new Error('Game is no longer in library')
    return game
  }

  private setStatus(status: GameStatus): void {
    this.status = status
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send('games:status', status)
    }
  }

  private restoreLivi(): void {
    if (this.restoring || this.runtimeState.isQuitting) return
    this.restoring = true

    const restore = () => {
      const window = getMainWindow()
      if (!window || window.isDestroyed()) return
      if (window.isMinimized()) window.restore()
      window.show()
      window.moveTop()
      window.focus()
      window.webContents.invalidate()
    }

    restore()
    setTimeout(() => {
      restore()
      this.restoring = false
    }, 150)
  }
}
