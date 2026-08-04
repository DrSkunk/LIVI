import LibraryAddRoundedIcon from '@mui/icons-material/LibraryAddRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import { Box, Button, CircularProgress, IconButton, Typography } from '@mui/material'
import type { GameLibraryItem, GameStatus } from '@shared/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ControllerPairing } from './ControllerPairing'
import { EmptyGameLibrary } from './EmptyGameLibrary'
import { GameCard } from './GameCard'

export function Games() {
  const [games, setGames] = useState<GameLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [launchingId, setLaunchingId] = useState<string | null>(null)
  const [openingRetroArch, setOpeningRetroArch] = useState(false)
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState('')
  const lastGameId = useRef<string | null>(null)
  const importingRef = useRef(false)
  const loadRequestId = useRef(0)

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current
    setLoading(true)
    setError('')
    try {
      const next = await window.games.getLibrary()
      if (requestId === loadRequestId.current) setGames(next)
    } catch (cause) {
      if (requestId === loadRequestId.current) {
        setError(cause instanceof Error ? cause.message : 'Could not load game library')
      }
    } finally {
      if (requestId === loadRequestId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const unsubscribe = window.games.onStatus((status: GameStatus) => {
      if (status.state === 'error') setError(status.message)
      if (status.state === 'idle' || status.state === 'error') {
        setLaunchingId(null)
        setOpeningRetroArch(false)
        const id = lastGameId.current
        requestAnimationFrame(() => document.getElementById(id ? `game-${id}` : '')?.focus())
      }
    })
    return () => {
      loadRequestId.current++
      unsubscribe()
    }
  }, [load])

  const launch = useCallback(async (game: GameLibraryItem) => {
    lastGameId.current = game.id
    setLaunchingId(game.id)
    setError('')
    try {
      await window.games.launch(game.id)
    } catch (cause) {
      setLaunchingId(null)
      setError(cause instanceof Error ? cause.message : 'Could not start RetroArch')
    }
  }, [])

  const importRoms = useCallback(async () => {
    if (importingRef.current) return
    importingRef.current = true
    setImporting(true)
    setError('')
    setNotice('')
    try {
      const result = await window.games.importRoms()
      await load()
      const coreWarning = result.missingCores.length
        ? ` Missing cores: ${result.missingCores.join(', ')}.`
        : ''
      setNotice(
        `Imported ${result.games} games into ${result.playlists} playlists; downloaded ${result.thumbnailsDownloaded} thumbnails.${coreWarning}`
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not import ROMs')
    } finally {
      importingRef.current = false
      setImporting(false)
    }
  }, [load])

  const openRetroArch = useCallback(async () => {
    setOpeningRetroArch(true)
    setError('')
    try {
      await window.games.openRetroArch()
    } catch (cause) {
      setOpeningRetroArch(false)
      setError(cause instanceof Error ? cause.message : 'Could not start RetroArch')
    }
  }, [])

  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        background:
          'radial-gradient(circle at 75% -15%, color-mix(in srgb, var(--ui-highlight) 16%, transparent), transparent 48%)'
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          px: 'clamp(16px, 3vw, 36px)',
          pt: 'clamp(12px, 3vh, 28px)'
        }}
      >
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            variant="h4"
            sx={{ fontWeight: 800, fontSize: 'clamp(1.35rem, 4vw, 2.35rem)' }}
          >
            Games
          </Typography>
          <Typography color="text.secondary" sx={{ fontSize: 'clamp(.72rem, 1.6vw, .95rem)' }}>
            {loading
              ? 'Scanning RetroArch playlists…'
              : `${games.length} ${games.length === 1 ? 'game' : 'games'}`}
          </Typography>
        </Box>
        <Button
          size="small"
          variant="contained"
          startIcon={
            importing ? <CircularProgress size={16} color="inherit" /> : <LibraryAddRoundedIcon />
          }
          onClick={() => void importRoms()}
          disabled={importing || loading || Boolean(launchingId)}
          sx={{ mr: 1, whiteSpace: 'nowrap' }}
        >
          {importing ? 'Importing…' : 'Import ROMs'}
        </Button>
        <ControllerPairing />
        <IconButton
          aria-label="Rescan game library"
          onClick={() => void load()}
          disabled={loading || Boolean(launchingId)}
        >
          <RefreshRoundedIcon />
        </IconButton>
      </Box>

      {notice && (
        <Typography color="success.main" sx={{ px: 'clamp(16px, 3vw, 36px)', mt: 1 }}>
          {notice}
        </Typography>
      )}

      {error && (
        <Typography role="alert" color="error" sx={{ px: 'clamp(16px, 3vw, 36px)', mt: 1 }}>
          {error}
        </Typography>
      )}

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 'clamp(14px, 2.4vw, 28px)',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollSnapType: 'x proximity',
          scrollBehavior: 'smooth',
          overscrollBehaviorX: 'contain',
          px: 'clamp(16px, 3vw, 36px)',
          py: 'clamp(12px, 3vh, 30px)',
          scrollbarWidth: 'thin',
          '&::after': { content: '""', flex: '0 0 8px' }
        }}
      >
        {loading ? (
          <CircularProgress sx={{ m: 'auto', color: 'var(--ui-highlight)' }} />
        ) : games.length ? (
          games.map((game, index) => (
            <GameCard
              key={game.id}
              game={game}
              index={index}
              launching={launchingId === game.id}
              onLaunch={launch}
            />
          ))
        ) : (
          <EmptyGameLibrary
            importing={importing}
            openingRetroArch={openingRetroArch}
            onImport={() => void importRoms()}
            onOpenRetroArch={() => void openRetroArch()}
          />
        )}
      </Box>
    </Box>
  )
}
