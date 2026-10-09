import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import GraphicEqOutlinedIcon from '@mui/icons-material/GraphicEqOutlined'
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined'
import SpeakerOutlinedIcon from '@mui/icons-material/SpeakerOutlined'
import VolumeUpOutlinedIcon from '@mui/icons-material/VolumeUpOutlined'
import { Box, Button, CircularProgress, IconButton, Stack, Typography } from '@mui/material'
import type { MiniDspConfig, MiniDspStatus } from '@shared/types'
import { TouchControl } from './MiniDspControls'

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
  const connected = status?.connected === true

  const emptyState = (kind: 'waiting' | 'error') => (
    <Box sx={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
      <Stack spacing={1.5} sx={{ maxWidth: 520, px: 2, py: 3, alignItems: 'center' }}>
        <GraphicEqOutlinedIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
        <Typography variant="h6">
          {kind === 'error' ? 'MiniDSP unavailable' : 'No MiniDSP connected'}
        </Typography>
        <Typography
          role={kind === 'error' ? 'alert' : undefined}
          color={kind === 'error' ? 'error' : 'text.secondary'}
        >
          {kind === 'error' ? error : 'Connect your MiniDSP, then refresh to try again.'}
        </Typography>
        <Button
          variant="outlined"
          color="inherit"
          disabled={busy}
          onClick={onRefresh}
          startIcon={<RefreshOutlinedIcon />}
          sx={{ minHeight: 44, textTransform: 'none', borderColor: 'divider' }}
        >
          Refresh
        </Button>
      </Stack>
    </Box>
  )

  return (
    <Box
      sx={{
        position: 'absolute',
        inset: 0,
        overflow: 'auto',
        boxSizing: 'border-box',
        p: 'clamp(12px, 2.5vw, 30px)',
        display: 'flex',
        justifyContent: 'center'
      }}
    >
      <Stack
        spacing="clamp(12px, 2svh, 20px)"
        sx={{ width: 'min(1050px, 100%)', minHeight: '100%' }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            minHeight: 48,
            pb: 1.5,
            borderBottom: '1px solid',
            borderColor: 'divider'
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: 'clamp(1.2rem, 3svh, 1.65rem)', fontWeight: 500 }}>
              MiniDSP
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {error
                ? 'Unavailable'
                : connected && status
                  ? ['Connected', status.productName, status.source].filter(Boolean).join(' · ')
                  : status
                    ? 'Not connected'
                    : 'Connecting…'}
            </Typography>
          </Box>
          <IconButton
            aria-label="Refresh MiniDSP"
            disabled={busy}
            onClick={onRefresh}
            sx={{ width: 48, height: 48 }}
          >
            {busy ? <CircularProgress size={22} /> : <RefreshOutlinedIcon />}
          </IconButton>
        </Box>

        {!status && !error ? (
          <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
            <CircularProgress size={40} aria-label="Connecting to MiniDSP" />
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
                title="Master volume"
                subtitle="Full system output"
                value={volume}
                min={config.volumeMinDb}
                max={config.volumeMaxDb}
                step={config.volumeStepDb}
                icon={<VolumeUpOutlinedIcon />}
                disabled={busy}
                onChange={onVolumeChange}
                onCommit={onVolumeCommit}
              />
              <TouchControl
                title="Bass"
                subtitle={`Outputs ${config.bassOutputChannels.map((index) => index + 1).join(' + ')}`}
                value={bass}
                min={config.bassMinDb}
                max={config.bassMaxDb}
                step={config.bassStepDb}
                icon={<SpeakerOutlinedIcon />}
                disabled={busy}
                onChange={onBassChange}
                onCommit={onBassCommit}
              />
            </Box>

            <Box>
              <Typography sx={{ mb: 1.5, fontWeight: 500 }}>Presets</Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.min(4, Math.max(1, config.presets.length))}, minmax(0, 1fr))`,
                  gap: 'clamp(8px, 1.4vw, 14px)',
                  '@media (max-width: 520px)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }
                }}
              >
                {config.presets.map((preset) => {
                  const selected = status.preset === preset.index
                  return (
                    <Button
                      key={preset.index}
                      aria-pressed={selected}
                      variant="outlined"
                      disabled={busy}
                      onClick={() => onPresetSelect(preset.index)}
                      sx={{
                        minHeight: 'clamp(48px, 10svh, 72px)',
                        borderRadius: 1,
                        justifyContent: 'space-between',
                        gap: 1,
                        px: 'clamp(12px, 2vw, 20px)',
                        textTransform: 'none',
                        color: 'text.primary',
                        borderColor: selected ? 'primary.main' : 'divider',
                        bgcolor: selected ? 'action.selected' : 'transparent',
                        '&:hover': { bgcolor: 'action.hover' },
                        '&.Mui-focusVisible': {
                          outline: '2px solid',
                          outlineColor: 'secondary.main',
                          outlineOffset: 2
                        }
                      }}
                    >
                      <Typography
                        component="span"
                        sx={{ fontWeight: selected ? 500 : 400, overflowWrap: 'anywhere' }}
                      >
                        {preset.label}
                      </Typography>
                      {selected && <CheckRoundedIcon fontSize="small" />}
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
