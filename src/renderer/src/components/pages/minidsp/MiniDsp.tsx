import AddRoundedIcon from '@mui/icons-material/AddRounded'
import GraphicEqOutlinedIcon from '@mui/icons-material/GraphicEqOutlined'
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined'
import RemoveRoundedIcon from '@mui/icons-material/RemoveRounded'
import SpeakerOutlinedIcon from '@mui/icons-material/SpeakerOutlined'
import VolumeUpOutlinedIcon from '@mui/icons-material/VolumeUpOutlined'
import { Box, Button, CircularProgress, IconButton, Slider, Stack, Typography } from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import type { MiniDspStatus } from '@shared/types'
import { useLiviStore } from '@store/store'
import { type ReactNode, useCallback, useEffect, useState } from 'react'

const MASTER_ACCENT = '#35d9ff'
const BASS_ACCENT = '#ff9d45'

const db = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`
const cleanError = (value: unknown) =>
  (value instanceof Error ? value.message : String(value)).replace(
    /^Error invoking remote method '[^']+': Error: /,
    ''
  )

const EqBars = ({ active, color }: { active: boolean; color: string }) => (
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

const TouchControl = ({
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
}: TouchControlProps) => {
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

export const MiniDsp = () => {
  const theme = useTheme()
  const settings = useLiviStore((state) => state.settings)
  const saveSettings = useLiviStore((state) => state.saveSettings)
  const config = settings?.minidsp
  const [status, setStatus] = useState<MiniDspStatus | null>(null)
  const [volume, setVolume] = useState(config?.volumeMinDb ?? -80)
  const [bass, setBass] = useState(config?.bassGainDb ?? 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const next = await window.minidsp.getStatus()
      setStatus(next)
      if (next.connected) setVolume(next.volumeDb)
      setError('')
    } catch (cause) {
      setError(cleanError(cause))
    }
  }, [])

  useEffect(() => {
    if (!config?.enabled) return
    void refresh()
    const timer = window.setInterval(() => void refresh(), 5000)
    return () => window.clearInterval(timer)
  }, [config?.enabled, refresh])

  useEffect(() => setBass(config?.bassGainDb ?? 0), [config?.bassGainDb])

  if (!config) return null

  const connected = status?.connected === true

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await action()
      await refresh()
    } catch (cause) {
      setError(cleanError(cause))
    } finally {
      setBusy(false)
    }
  }

  const commitBass = (value: number) =>
    run(async () => {
      await window.minidsp.setBassGain(value)
      await saveSettings({ minidsp: { ...config, bassGainDb: value } })
    })

  const emptyState = (kind: 'waiting' | 'error') => {
    const accent = kind === 'error' ? '#ff5470' : MASTER_ACCENT
    return (
      <Box
        sx={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}
      >
        <Stack spacing={1.5} sx={{ maxWidth: 520, px: 2, alignItems: 'center' }}>
          <Box
            sx={{
              position: 'relative',
              width: 'clamp(88px, 17svh, 132px)',
              height: 'clamp(88px, 17svh, 132px)',
              display: 'grid',
              placeItems: 'center',
              color: accent,
              '&::before, &::after': {
                content: '""',
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: `1px solid ${alpha(accent, 0.5)}`,
                boxShadow: `inset 0 0 30px ${alpha(accent, 0.12)}, 0 0 30px ${alpha(accent, 0.12)}`
              },
              '&::after': {
                inset: -16,
                opacity: 0.35,
                animation: kind === 'waiting' ? 'miniDspPulse 1.8s ease-out infinite' : 'none'
              },
              '@media (prefers-reduced-motion: reduce)': { '&::after': { animation: 'none' } }
            }}
          >
            <GraphicEqOutlinedIcon sx={{ fontSize: 'clamp(42px, 9svh, 68px)' }} />
          </Box>
          <Typography sx={{ fontSize: 'clamp(1.4rem, 4svh, 2.2rem)', fontWeight: 750 }}>
            {kind === 'error' ? 'SIGNAL LOST' : 'READY TO CONNECT'}
          </Typography>
          <Typography color="text.secondary" sx={{ fontSize: 'clamp(0.8rem, 2.2svh, 1rem)' }}>
            {kind === 'error' ? error : 'Daemon online. Connect your MiniDSP to light this up.'}
          </Typography>
          <Button
            variant="outlined"
            onClick={() => void refresh()}
            startIcon={<RefreshOutlinedIcon />}
            sx={{
              mt: 0.5,
              minHeight: 48,
              borderRadius: 999,
              px: 3,
              color: accent,
              borderColor: alpha(accent, 0.5),
              '&:active': { transform: 'scale(0.95)' }
            }}
          >
            Scan again
          </Button>
        </Stack>
      </Box>
    )
  }

  return (
    <Box
      sx={{
        '@keyframes miniDspPulse': {
          '0%': { transform: 'scale(0.82)', opacity: 0.65 },
          '100%': { transform: 'scale(1.25)', opacity: 0 }
        },
        '@keyframes miniDspEq': {
          from: { transform: 'scaleY(0.45)', opacity: 0.65 },
          to: { transform: 'scaleY(1)', opacity: 1 }
        },
        position: 'absolute',
        inset: 0,
        overflow: 'auto',
        boxSizing: 'border-box',
        p: 'clamp(12px, 2.5vw, 30px)',
        display: 'flex',
        justifyContent: 'center',
        background: `radial-gradient(circle at 18% 0%, ${alpha(MASTER_ACCENT, 0.13)}, transparent 34%), radial-gradient(circle at 88% 100%, ${alpha(BASS_ACCENT, 0.1)}, transparent 32%)`
      }}
    >
      <Stack
        spacing="clamp(12px, 2svh, 20px)"
        sx={{ width: 'min(1050px, 100%)', minHeight: '100%' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', minHeight: 46 }}>
          <Box
            sx={{
              width: 42,
              height: 42,
              borderRadius: 2.5,
              display: 'grid',
              placeItems: 'center',
              mr: 1.5,
              color: MASTER_ACCENT,
              background: `linear-gradient(145deg, ${alpha(MASTER_ACCENT, 0.2)}, ${alpha(
                MASTER_ACCENT,
                0.05
              )})`,
              border: `1px solid ${alpha(MASTER_ACCENT, 0.25)}`,
              boxShadow: `0 0 22px ${alpha(MASTER_ACCENT, 0.16)}`
            }}
          >
            <GraphicEqOutlinedIcon />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 'clamp(1.2rem, 3svh, 1.65rem)', fontWeight: 800 }}>
              MiniDSP{' '}
              <Box component="span" sx={{ color: MASTER_ACCENT }}>
                CONTROL
              </Box>
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: connected ? '#45ef9d' : error ? '#ff5470' : 'text.disabled',
                  boxShadow: connected ? '0 0 10px #45ef9d' : 'none'
                }}
              />
              <Typography variant="caption" color="text.secondary" noWrap>
                {connected && status
                  ? [status.productName, status.source].filter(Boolean).join('  /  ')
                  : error
                    ? 'DAEMON OFFLINE'
                    : status
                      ? 'WAITING FOR DEVICE'
                      : 'CONNECTING'}
              </Typography>
            </Box>
          </Box>
          {connected && (
            <Box
              sx={{
                display: { xs: 'none', sm: 'flex' },
                alignItems: 'center',
                gap: 0.8,
                mr: 1,
                px: 1.5,
                py: 0.65,
                borderRadius: 99,
                color: '#45ef9d',
                backgroundColor: alpha('#45ef9d', 0.08),
                border: `1px solid ${alpha('#45ef9d', 0.22)}`
              }}
            >
              <EqBars active color="#45ef9d" />
              <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: '0.12em' }}>
                LIVE
              </Typography>
            </Box>
          )}
          <IconButton
            aria-label="Refresh MiniDSP"
            disabled={busy}
            onClick={() => void refresh()}
            sx={{ width: 48, height: 48, '&:active': { transform: 'rotate(25deg) scale(0.9)' } }}
          >
            {busy ? <CircularProgress size={22} /> : <RefreshOutlinedIcon />}
          </IconButton>
        </Box>

        {!status && !error ? (
          <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
            <CircularProgress size={40} sx={{ color: MASTER_ACCENT }} />
          </Box>
        ) : error ? (
          emptyState('error')
        ) : !connected ? (
          emptyState('waiting')
        ) : (
          <Stack
            spacing="clamp(12px, 2svh, 20px)"
            sx={{ flex: 1, justifyContent: 'center', pb: 1 }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 'clamp(12px, 2vw, 20px)',
                '@media (max-width: 560px)': { gridTemplateColumns: '1fr' }
              }}
            >
              <TouchControl
                title="MASTER"
                subtitle="Full system output"
                value={volume}
                min={config.volumeMinDb}
                max={config.volumeMaxDb}
                step={config.volumeStepDb}
                accent={MASTER_ACCENT}
                icon={<VolumeUpOutlinedIcon />}
                disabled={busy}
                onChange={setVolume}
                onCommit={(next) => void run(() => window.minidsp.setVolume(next))}
              />
              <TouchControl
                title="BASS"
                subtitle={`Outputs ${config.bassOutputChannels.map((index) => index + 1).join(' + ')}`}
                value={bass}
                min={config.bassMinDb}
                max={config.bassMaxDb}
                step={config.bassStepDb}
                accent={BASS_ACCENT}
                icon={<SpeakerOutlinedIcon />}
                disabled={busy}
                onChange={setBass}
                onCommit={(next) => void commitBass(next)}
              />
            </Box>

            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, px: 0.5 }}>
                <Typography
                  variant="overline"
                  color="text.secondary"
                  sx={{ flex: 1, fontWeight: 800, letterSpacing: '0.16em' }}
                >
                  Sound profiles
                </Typography>
                <Typography variant="caption" color="text.disabled">
                  TAP TO LOAD
                </Typography>
              </Box>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, config.presets.length))}, minmax(0, 1fr))`,
                  gap: 'clamp(8px, 1.4vw, 14px)',
                  '@media (max-width: 520px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }
                }}
              >
                {config.presets.map((preset, index) => {
                  const selected = status.preset === preset.index
                  return (
                    <Button
                      key={preset.index}
                      aria-pressed={selected}
                      disabled={busy}
                      onClick={() => void run(() => window.minidsp.selectPreset(preset.index))}
                      sx={{
                        position: 'relative',
                        minHeight: 'clamp(70px, 13svh, 106px)',
                        borderRadius: 'clamp(15px, 2.2vw, 23px)',
                        overflow: 'hidden',
                        justifyContent: 'flex-start',
                        px: 'clamp(12px, 2vw, 20px)',
                        color: selected ? '#071014' : 'text.primary',
                        border: '1px solid',
                        borderColor: selected ? MASTER_ACCENT : 'divider',
                        background: selected
                          ? `linear-gradient(135deg, ${MASTER_ACCENT}, #72f1d4)`
                          : alpha(theme.palette.text.primary, 0.035),
                        boxShadow: selected
                          ? `0 10px 32px ${alpha(MASTER_ACCENT, 0.28)}, inset 0 1px 0 ${alpha('#fff', 0.45)}`
                          : `inset 0 1px 0 ${alpha('#fff', 0.04)}`,
                        transition: 'transform 100ms ease, box-shadow 140ms ease',
                        '&:active': { transform: 'scale(0.94)' },
                        '&:hover': {
                          background: selected
                            ? `linear-gradient(135deg, ${MASTER_ACCENT}, #72f1d4)`
                            : alpha(theme.palette.text.primary, 0.07)
                        }
                      }}
                    >
                      <Box sx={{ textAlign: 'left', minWidth: 0 }}>
                        <Typography
                          variant="caption"
                          sx={{
                            display: 'block',
                            opacity: 0.65,
                            fontWeight: 900,
                            letterSpacing: '0.12em'
                          }}
                        >
                          {String(index + 1).padStart(2, '0')}
                        </Typography>
                        <Typography
                          noWrap
                          sx={{ fontWeight: 800, fontSize: 'clamp(0.8rem, 2.2svh, 1rem)' }}
                        >
                          {preset.label}
                        </Typography>
                      </Box>
                      <Box sx={{ ml: 'auto', pl: 1 }}>
                        <EqBars active={selected} color={selected ? '#071014' : MASTER_ACCENT} />
                      </Box>
                    </Button>
                  )
                })}
              </Box>
            </Box>
          </Stack>
        )}
      </Stack>
    </Box>
  )
}
