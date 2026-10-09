import AddRoundedIcon from '@mui/icons-material/AddRounded'
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded'
import { Box, IconButton, Slider, Typography } from '@mui/material'
import type { ReactNode } from 'react'

const db = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`

type TouchControlProps = {
  title: string
  subtitle: string
  value: number
  min: number
  max: number
  step: number
  icon: ReactNode
  disabled: boolean
  onChange: (value: number) => void
  onCommit: (value: number) => void
}

export function TouchControl({
  title,
  subtitle,
  value,
  min,
  max,
  step,
  icon,
  disabled,
  onChange,
  onCommit
}: TouchControlProps) {
  const nudge = (direction: -1 | 1) => {
    const next = Math.max(min, Math.min(max, Number((value + direction * step).toFixed(2))))
    onChange(next)
    onCommit(next)
  }
  const touchButtonSx = {
    width: 'clamp(44px, 7svh, 58px)',
    height: 'clamp(44px, 7svh, 58px)',
    flex: 'none',
    color: 'text.primary',
    border: '1px solid',
    borderColor: 'divider',
    borderRadius: 1,
    '&:hover, &.Mui-focusVisible': {
      backgroundColor: 'action.hover'
    },
    '&.Mui-focusVisible': { outline: '2px solid', outlineColor: 'secondary.main' }
  } as const

  return (
    <Box
      sx={{
        borderRadius: 1.5,
        p: 'clamp(16px, 3vw, 28px)',
        minWidth: 0,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper'
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box sx={{ display: 'flex', color: 'text.secondary' }}>{icon}</Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 500 }}>{title}</Typography>
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'baseline', mt: 'clamp(12px, 2.5svh, 22px)' }}>
        <Typography
          sx={{
            fontSize: 'clamp(2rem, 7svh, 3.5rem)',
            lineHeight: 1,
            fontWeight: 500,
            fontVariantNumeric: 'tabular-nums'
          }}
        >
          {db(value)}
        </Typography>
        <Typography color="text.secondary" sx={{ ml: 1 }}>
          dB
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 'clamp(10px, 2vw, 18px)', mt: 2 }}>
        <IconButton
          aria-label={`Decrease ${title}`}
          disabled={disabled || value <= min}
          onClick={() => nudge(-1)}
          sx={touchButtonSx}
        >
          <RemoveRoundedIcon />
        </IconButton>
        <Slider
          aria-label={title}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          valueLabelDisplay="off"
          onChange={(_, next) => {
            if (typeof next === 'number') onChange(next)
          }}
          onChangeCommitted={(_, next) => {
            if (typeof next === 'number') onCommit(next)
          }}
          sx={{
            height: 6,
            py: 2.5,
            '& .MuiSlider-thumb': { width: 24, height: 24 }
          }}
        />
        <IconButton
          aria-label={`Increase ${title}`}
          disabled={disabled || value >= max}
          onClick={() => nudge(1)}
          sx={touchButtonSx}
        >
          <AddRoundedIcon />
        </IconButton>
      </Box>
    </Box>
  )
}
