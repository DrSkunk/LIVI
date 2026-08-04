import AddRoundedIcon from '@mui/icons-material/AddRounded'
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded'
import { Box, IconButton, Slider, Typography } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import type { ReactNode } from 'react'

export const MASTER_ACCENT = '#35d9ff'
export const BASS_ACCENT = '#ff9d45'

const db = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`

export const EqBars = ({ active, color }: { active: boolean; color: string }) => (
  <Box
    aria-hidden
    sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px', height: 28 }}
  >
    {[10, 21, 15, 26, 12].map((height, index) => (
      <Box
        key={`${height}-${index}`}
        sx={{
          width: 3,
          height,
          borderRadius: 4,
          backgroundColor: color,
          opacity: active ? 1 : 0.32,
          boxShadow: active ? `0 0 8px ${color}` : 'none',
          transformOrigin: 'center',
          animation: active
            ? `miniDspEq ${700 + index * 90}ms ease-in-out infinite alternate`
            : 'none',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' }
        }}
      />
    ))}
  </Box>
)

type TouchControlProps = {
  title: string
  subtitle: string
  value: number
  min: number
  max: number
  step: number
  accent: string
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
  accent,
  icon,
  disabled,
  onChange,
  onCommit
}: TouchControlProps) {
  const theme = useTheme()
  const nudge = (direction: -1 | 1) => {
    const next = Math.max(min, Math.min(max, Number((value + direction * step).toFixed(2))))
    onChange(next)
    onCommit(next)
  }
  const touchButtonSx = {
    width: 'clamp(44px, 7svh, 58px)',
    height: 'clamp(44px, 7svh, 58px)',
    flex: 'none',
    color: accent,
    border: '1px solid',
    borderColor: alpha(accent, 0.35),
    backgroundColor: alpha(accent, 0.08),
    transition: 'transform 90ms ease, background-color 90ms ease',
    '&:active': { transform: 'scale(0.9)', backgroundColor: alpha(accent, 0.2) },
    '&.Mui-disabled': { opacity: 0.25 }
  } as const

  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'visible',
        borderRadius: 'clamp(18px, 3vw, 30px)',
        p: 'clamp(16px, 3vw, 28px)',
        minWidth: 0,
        border: '1px solid',
        borderColor: alpha(accent, 0.24),
        background: `linear-gradient(145deg, ${alpha(accent, 0.13)} 0%, ${alpha(
          theme.palette.background.default,
          0.78
        )} 48%, ${alpha(theme.palette.text.primary, 0.025)} 100%)`,
        boxShadow: `inset 0 1px 0 ${alpha('#fff', 0.07)}, 0 18px 55px ${alpha('#000', 0.3)}`,
        '&::after': {
          content: '""',
          position: 'absolute',
          width: 150,
          height: 150,
          right: -75,
          top: -85,
          borderRadius: '50%',
          backgroundColor: alpha(accent, 0.16),
          filter: 'blur(28px)',
          pointerEvents: 'none'
        }
      }}
    >
      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2.5,
              display: 'grid',
              placeItems: 'center',
              color: accent,
              backgroundColor: alpha(accent, 0.12),
              boxShadow: `inset 0 0 0 1px ${alpha(accent, 0.2)}`
            }}
          >
            {icon}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, lineHeight: 1.1 }}>{title}</Typography>
            <Typography variant="caption" color="text.secondary">
              {subtitle}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'baseline', mt: 'clamp(12px, 2.5svh, 22px)' }}>
          <Typography
            sx={{
              fontSize: 'clamp(2.2rem, 8svh, 4.6rem)',
              lineHeight: 0.9,
              fontWeight: 800,
              letterSpacing: '-0.06em',
              fontVariantNumeric: 'tabular-nums',
              color: theme.palette.text.primary,
              textShadow: `0 0 24px ${alpha(accent, 0.2)}`
            }}
          >
            {db(value)}
          </Typography>
          <Typography sx={{ ml: 1, color: accent, fontWeight: 800, letterSpacing: '0.08em' }}>
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
            onChange={(_, next) => onChange(next as number)}
            onChangeCommitted={(_, next) => onCommit(next as number)}
            sx={{
              color: accent,
              height: 16,
              py: 2,
              '& .MuiSlider-rail': {
                height: 10,
                borderRadius: 99,
                opacity: 1,
                backgroundColor: alpha(theme.palette.text.primary, 0.13),
                boxShadow: `inset 0 2px 5px ${alpha('#000', 0.45)}`
              },
              '& .MuiSlider-track': {
                height: 10,
                border: 0,
                borderRadius: 99,
                background: `linear-gradient(90deg, ${alpha(accent, 0.5)}, ${accent})`,
                boxShadow: `0 0 14px ${alpha(accent, 0.5)}`
              },
              '& .MuiSlider-thumb': {
                width: 'clamp(28px, 5svh, 38px)',
                height: 'clamp(28px, 5svh, 38px)',
                color: theme.palette.background.default,
                border: `4px solid ${accent}`,
                boxShadow: `0 0 0 5px ${alpha(accent, 0.12)}, 0 0 20px ${alpha(accent, 0.75)}`,
                '&::before': { boxShadow: 'none' },
                '&:hover, &.Mui-focusVisible': {
                  boxShadow: `0 0 0 8px ${alpha(accent, 0.2)}, 0 0 24px ${alpha(accent, 0.85)}`
                },
                '&.Mui-active': {
                  boxShadow: `0 0 0 10px ${alpha(accent, 0.24)}, 0 0 28px ${alpha(accent, 0.95)}`
                }
              }
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
    </Box>
  )
}
