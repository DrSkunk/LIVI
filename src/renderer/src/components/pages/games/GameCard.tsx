import SportsEsportsRoundedIcon from '@mui/icons-material/SportsEsportsRounded'
import { Box, ButtonBase, CircularProgress, Typography } from '@mui/material'
import type { GameLibraryItem } from '@shared/types'
import { useEffect, useState } from 'react'

type GameCardProps = {
  game: GameLibraryItem
  launching: boolean
  onLaunch: (game: GameLibraryItem) => void
}

export function GameCard({ game, launching, onLaunch }: GameCardProps) {
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
    <ButtonBase
      id={`game-${game.id}`}
      type="button"
      aria-label={`Play ${game.title}`}
      disabled={launching}
      onClick={() => onLaunch(game)}
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        flex: '0 0 clamp(128px, 23vw, 250px)',
        height: 'clamp(178px, 62vh, 390px)',
        maxHeight: '100%',
        padding: 0,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1.5,
        overflow: 'hidden',
        scrollSnapAlign: 'center',
        cursor: launching ? 'wait' : 'pointer',
        bgcolor: 'background.paper',
        color: 'text.primary',
        textAlign: 'left',
        '&:hover': { bgcolor: 'action.hover' },
        '&.Mui-focusVisible': {
          outline: '2px solid',
          outlineColor: 'secondary.main',
          outlineOffset: 2
        },
        '&:disabled': { opacity: 0.6 }
      }}
    >
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          placeItems: 'center',
          bgcolor: 'action.hover',
          overflow: 'hidden'
        }}
      >
        {thumbnail ? (
          <Box
            component="img"
            src={thumbnail}
            alt=""
            draggable={false}
            sx={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }}
          />
        ) : (
          <SportsEsportsRoundedIcon
            sx={{ fontSize: 'clamp(40px, 7vw, 64px)', color: 'text.secondary' }}
          />
        )}
      </Box>

      <Box
        sx={{
          flex: 'none',
          p: 1.5,
          textAlign: 'left',
          borderTop: '1px solid',
          borderColor: 'divider'
        }}
      >
        <Typography
          sx={{
            fontWeight: 500,
            fontSize: 'clamp(.9rem, 2.1vw, 1.1rem)',
            lineHeight: 1.4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {game.title}
        </Typography>
        <Typography
          sx={{
            color: 'text.secondary',
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
            bgcolor: 'action.disabledBackground'
          }}
        >
          <CircularProgress aria-label={`Launching ${game.title}`} />
        </Box>
      )}
    </ButtonBase>
  )
}
