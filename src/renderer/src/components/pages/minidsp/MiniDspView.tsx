import {
  alpha,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  Typography,
  useTheme
} from '@renderer/ui'
import {
  GraphicEqOutlinedIcon,
  RefreshOutlinedIcon,
  SpeakerOutlinedIcon,
  VolumeUpOutlinedIcon
} from '@renderer/ui/icons'
import type { MiniDspConfig, MiniDspStatus } from '@shared/types'
import { BASS_ACCENT, EqBars, MASTER_ACCENT, TouchControl } from './MiniDspControls'

type MiniDspViewProps = {
  config: MiniDspConfig
  status: MiniDspStatus | null
  volume: number
  bass: number
  busy: boolean
  error: string
  onRefresh: () => void
  onVolumeChange: (value: number) => void
  onVolumeCommit: (value: number) => void
  onBassChange: (value: number) => void
  onBassCommit: (value: number) => void
  onPresetSelect: (preset: number) => void
}

export function MiniDspView({
  config,
  status,
  volume,
  bass,
  busy,
  error,
  onRefresh,
  onVolumeChange,
  onVolumeCommit,
  onBassChange,
  onBassCommit,
  onPresetSelect
}: MiniDspViewProps) {
  const theme = useTheme()
  const connected = status?.connected === true

  const emptyState = (kind: 'waiting' | 'error') => {
    const accent = kind === 'error' ? '#c84a3f' : MASTER_ACCENT
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
            onClick={onRefresh}
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
                  backgroundColor: connected ? '#78a96f' : error ? '#c84a3f' : 'text.disabled',
                  boxShadow: connected ? '0 0 10px #78a96f' : 'none'
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
                color: '#78a96f',
                backgroundColor: alpha('#78a96f', 0.08),
                border: `1px solid ${alpha('#78a96f', 0.22)}`
              }}
            >
              <EqBars active color="#78a96f" />
              <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: '0.12em' }}>
                LIVE
              </Typography>
            </Box>
          )}
          <IconButton
            aria-label="Refresh MiniDSP"
            disabled={busy}
            onClick={onRefresh}
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
                onChange={onVolumeChange}
                onCommit={onVolumeCommit}
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
                onChange={onBassChange}
                onCommit={onBassCommit}
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
                      onClick={() => onPresetSelect(preset.index)}
                      sx={{
                        position: 'relative',
                        minHeight: 'clamp(70px, 13svh, 106px)',
                        borderRadius: 'clamp(6px, 0.8vw, 9px)',
                        overflow: 'hidden',
                        justifyContent: 'flex-start',
                        px: 'clamp(12px, 2vw, 20px)',
                        color: selected ? '#1a1004' : 'text.primary',
                        border: '1px solid',
                        borderColor: selected ? MASTER_ACCENT : 'divider',
                        background: selected
                          ? `linear-gradient(135deg, ${MASTER_ACCENT}, #ffc766)`
                          : alpha(theme.palette.text.primary, 0.035),
                        boxShadow: selected
                          ? `0 10px 32px ${alpha(MASTER_ACCENT, 0.28)}, inset 0 1px 0 ${alpha('#fff', 0.45)}`
                          : `inset 0 1px 0 ${alpha('#fff', 0.04)}`,
                        transition: 'transform 100ms ease, box-shadow 140ms ease',
                        '&:active': { transform: 'scale(0.94)' },
                        '&:hover': {
                          background: selected
                            ? `linear-gradient(135deg, ${MASTER_ACCENT}, #ffc766)`
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
                        <EqBars active={selected} color={selected ? '#1a1004' : MASTER_ACCENT} />
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
