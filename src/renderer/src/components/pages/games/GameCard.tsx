import { Box, CircularProgress, Typography } from '@renderer/ui'
import { SportsEsportsRoundedIcon } from '@renderer/ui/icons'
import type { GameLibraryItem } from '@shared/types'
import { useEffect, useState } from 'react'

type GameCardProps = {
  game: GameLibraryItem
  index: number
  launching: boolean
  onLaunch: (game: GameLibraryItem) => void
}

export function GameCard({ game, index, launching, onLaunch }: GameCardProps) {
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
