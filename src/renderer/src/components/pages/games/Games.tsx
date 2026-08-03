import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import SportsEsportsRoundedIcon from '@mui/icons-material/SportsEsportsRounded'
import { Box, Button, CircularProgress, IconButton, Typography } from '@mui/material'
import { DEFAULT_ROM_DIRECTORY, type GameLibraryItem, type GameStatus } from '@shared/types'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ControllerPairing } from './ControllerPairing'

function GameCard({
  game,
  index,
  launching,
  onLaunch
}: {
  game: GameLibraryItem
  index: number
  launching: boolean
  onLaunch: (game: GameLibraryItem) => void
}) {
  const [thumbnail, setThumbnail] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!game.hasThumbnail) return

    window.games
      .getThumbnail(game.id)
      .then((image) => {
        if (active) setThumbnail(image)
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [game.hasThumbnail, game.id])

  return (
    <Box
      id={`game-${game.id}`}
      component="button"
      type="button"
      aria-label={`Play ${game.title}`}
      disabled={launching}
      onClick={() => onLaunch(game)}
      sx={{
        '--delay': `${Math.min(index, 12) * 45}ms`,
        position: 'relative',
        flex: '0 0 clamp(128px, 23vw, 250px)',
        height: 'clamp(178px, 62vh, 390px)',
        padding: 0,
        border: 0,
        borderRadius: 'clamp(12px, 2vw, 24px)',
        overflow: 'hidden',
        scrollSnapAlign: 'center',
        cursor: launching ? 'wait' : 'pointer',
        background: 'linear-gradient(150deg, rgba(255,255,255,.13), rgba(255,255,255,.035))',
        color: 'inherit',
        boxShadow: '0 14px 30px rgba(0,0,0,.28)',
        opacity: 0,
        transform: 'translate3d(30px, 0, 0) scale(.96)',
        animation: 'game-card-in 480ms cubic-bezier(.2,.8,.2,1) forwards',
        animationDelay: 'var(--delay)',
        transition: 'transform 180ms ease, box-shadow 180ms ease, opacity 180ms ease',
        '&:hover, &:focus-visible': {
          outline: '3px solid var(--ui-highlight)',
          outlineOffset: 3,
          transform: 'translate3d(0,-7px,0) scale(1.035)',
          boxShadow: '0 20px 42px rgba(0,0,0,.42)'
        },
        '&:active': { transform: 'scale(.97)' },
        '&:disabled': { opacity: launching ? 0.45 : 1 },
        '@media (prefers-reduced-motion: reduce)': {
          animation: 'none',
          opacity: 1,
          transform: 'none',
          transition: 'none'
        },
        '@keyframes game-card-in': {
          to: { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }
        }
      }}
    >
      {thumbnail ? (
        <Box
          component="img"
          src={thumbnail}
          alt=""
          draggable={false}
          sx={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
        />
      ) : (
        <Box
          sx={{
            height: '100%',
            display: 'grid',
            placeItems: 'center',
            background:
              'radial-gradient(circle at 25% 15%, color-mix(in srgb, var(--ui-highlight) 35%, transparent), transparent 48%), linear-gradient(145deg, #30343d, #15171c)'
          }}
        >
          <SportsEsportsRoundedIcon sx={{ fontSize: 'clamp(48px, 9vw, 96px)', opacity: 0.42 }} />
        </Box>
      )}

      <Box
        sx={{
          position: 'absolute',
          inset: 'auto 0 0',
          padding: '30% 14px 13px',
          textAlign: 'left',
          background: 'linear-gradient(transparent, rgba(0,0,0,.9))'
        }}
      >
        <Typography
          sx={{
            color: '#fff',
            fontWeight: 750,
            fontSize: 'clamp(.9rem, 2.1vw, 1.28rem)',
            lineHeight: 1.08,
            textShadow: '0 2px 5px #000',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {game.title}
        </Typography>
        <Typography
          sx={{
            color: 'rgba(255,255,255,.72)',
            fontSize: 'clamp(.68rem, 1.4vw, .86rem)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {game.system}
        </Typography>
      </Box>

      {launching && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            bgcolor: 'rgba(0,0,0,.52)'
          }}
        >
          <CircularProgress sx={{ color: 'var(--ui-highlight)' }} />
        </Box>
      )}
    </Box>
  )
}

export function Games() {
  const [games, setGames] = useState<GameLibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [launchingId, setLaunchingId] = useState<string | null>(null)
  const [openingRetroArch, setOpeningRetroArch] = useState(false)
  const lastGameId = useRef<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setGames(await window.games.getLibrary())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load game library')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    return window.games.onStatus((status: GameStatus) => {
      if (status.state === 'error') setError(status.message)
      if (status.state === 'idle' || status.state === 'error') {
        setLaunchingId(null)
        setOpeningRetroArch(false)
        const id = lastGameId.current
        requestAnimationFrame(() => document.getElementById(id ? `game-${id}` : '')?.focus())
      }
    })
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
        <ControllerPairing />
        <IconButton
          aria-label="Rescan game library"
          onClick={() => void load()}
          disabled={loading || Boolean(launchingId)}
        >
          <RefreshRoundedIcon />
        </IconButton>
      </Box>

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
          <Box
            sx={{
              m: 'auto',
              maxWidth: 620,
              px: 2,
              textAlign: 'center',
              display: 'grid',
              justifyItems: 'center',
              gap: 0.75
            }}
          >
            <SportsEsportsRoundedIcon sx={{ fontSize: 72, mb: 0.5, opacity: 0.72 }} />
            <Typography variant="h6">Add games to LIVI</Typography>
            <Typography color="text.secondary">
              Place legally obtained ROMs in <strong>{DEFAULT_ROM_DIRECTORY}</strong>.
            </Typography>
            <Typography color="text.secondary">
              Open RetroArch, then use Import Content → Scan Directory and select that folder.
              Download cover art with Online Updater → Playlist Thumbnails Updater.
            </Typography>
            <Button
              variant="contained"
              onClick={() => void openRetroArch()}
              disabled={openingRetroArch}
              startIcon={
                openingRetroArch ? <CircularProgress size={16} color="inherit" /> : undefined
              }
              sx={{ mt: 1 }}
            >
              {openingRetroArch ? 'Opening RetroArch…' : 'Open RetroArch'}
            </Button>
            <Typography color="text.secondary" sx={{ fontSize: '.78rem', mt: 0.5 }}>
              Playlists and thumbnails are read automatically from ~/.config/retroarch.
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  )
}
