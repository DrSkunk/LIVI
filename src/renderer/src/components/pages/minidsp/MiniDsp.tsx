import GraphicEqOutlinedIcon from '@mui/icons-material/GraphicEqOutlined'
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined'
import SpeakerOutlinedIcon from '@mui/icons-material/SpeakerOutlined'
import VolumeUpOutlinedIcon from '@mui/icons-material/VolumeUpOutlined'
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  Slider,
  Stack,
  Typography
} from '@mui/material'
import { alpha, useTheme } from '@mui/material/styles'
import type { MiniDspStatus } from '@shared/types'
import { useLiviStore } from '@store/store'
import { useCallback, useEffect, useState } from 'react'
import { SliderValueThumb } from '../../SliderValueThumb'

const db = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`
const cleanError = (value: unknown) =>
  (value instanceof Error ? value.message : String(value)).replace(
    /^Error invoking remote method '[^']+': Error: /,
    ''
  )

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

  const setBassGain = (value: number) =>
    run(async () => {
      await window.minidsp.setBassGain(value)
      await saveSettings({ minidsp: { ...config, bassGainDb: value } })
    })

  const emptyState = (kind: 'waiting' | 'error') => (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center'
      }}
    >
      <Stack spacing={1.5} sx={{ maxWidth: 480, px: 2, alignItems: 'center' }}>
        <Box
          sx={{
            width: 'clamp(64px, 12svh, 92px)',
            height: 'clamp(64px, 12svh, 92px)',
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            color: kind === 'error' ? 'text.secondary' : 'primary.main',
            border: '1px solid',
            borderColor: kind === 'error' ? 'divider' : alpha(theme.palette.primary.main, 0.45),
            backgroundColor:
              kind === 'error' ? 'transparent' : alpha(theme.palette.primary.main, 0.08)
          }}
        >
          <GraphicEqOutlinedIcon sx={{ fontSize: 'clamp(32px, 6svh, 48px)' }} />
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>
          {kind === 'error' ? 'MiniDSP unavailable' : 'Waiting for MiniDSP'}
        </Typography>
        <Typography color="text.secondary" sx={{ fontSize: 'clamp(0.8rem, 2.2svh, 1rem)' }}>
          {kind === 'error' ? error : 'Daemon connected. Connect a MiniDSP device to begin.'}
        </Typography>
        <Button
          variant="outlined"
          onClick={() => void refresh()}
          startIcon={<RefreshOutlinedIcon />}
          sx={{ mt: 0.5, borderRadius: 999, px: 2.5 }}
        >
          Retry
        </Button>
      </Stack>
    </Box>
  )

  return (
    <Box
      sx={{
        height: '100%',
        overflow: 'auto',
        boxSizing: 'border-box',
        p: 'clamp(12px, 3vw, 32px)',
        display: 'flex',
        justifyContent: 'center'
      }}
    >
      <Stack spacing={2} sx={{ width: 'min(820px, 100%)', minHeight: '100%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>
          <Box
            sx={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              mr: 1.5,
              color: 'primary.main',
              backgroundColor: alpha(theme.palette.primary.main, 0.1)
            }}
          >
            <GraphicEqOutlinedIcon />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" sx={{ fontWeight: 600, lineHeight: 1.15 }}>
              MiniDSP
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.35 }}>
              <Box
                component="span"
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  flex: 'none',
                  backgroundColor: connected
                    ? 'success.main'
                    : error
                      ? 'error.main'
                      : 'text.disabled'
                }}
              />
              <Typography variant="body2" color="text.secondary" noWrap>
                {connected && status
                  ? [status.productName, status.source].filter(Boolean).join(' · ')
                  : error
                    ? 'Daemon unavailable'
                    : status
                      ? 'No device connected'
                      : 'Connecting…'}
              </Typography>
            </Box>
          </Box>
          <IconButton
            className="nav-focus-primary"
            aria-label="Refresh MiniDSP"
            disabled={busy}
            onClick={() => void refresh()}
          >
            {busy ? <CircularProgress size={22} /> : <RefreshOutlinedIcon />}
          </IconButton>
        </Box>

        {!status && !error ? (
          <Box sx={{ flex: 1, display: 'grid', placeItems: 'center' }}>
            <CircularProgress size={32} />
          </Box>
        ) : error ? (
          emptyState('error')
        ) : !connected ? (
          emptyState('waiting')
        ) : (
          <Stack spacing={2} sx={{ justifyContent: 'center', flex: 1, pb: 2 }}>
            <Box
              sx={{
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 4,
                overflow: 'hidden',
                backgroundColor: alpha(theme.palette.text.primary, 0.025)
              }}
            >
              <Box sx={{ p: 'clamp(16px, 3svh, 26px)' }}>
                <Typography
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, fontWeight: 500 }}
                >
                  <VolumeUpOutlinedIcon color="primary" /> Master volume
                </Typography>
                <Slider
                  aria-label="MiniDSP master volume"
                  min={config.volumeMinDb}
                  max={config.volumeMaxDb}
                  step={config.volumeStepDb}
                  value={volume}
                  disabled={busy}
                  valueLabelDisplay="on"
                  valueLabelFormat={db}
                  slots={{ thumb: SliderValueThumb }}
                  onChange={(_, value) => setVolume(value as number)}
                  onChangeCommitted={(_, value) =>
                    void run(() => window.minidsp.setVolume(value as number))
                  }
                />
              </Box>

              <Divider />

              <Box sx={{ p: 'clamp(16px, 3svh, 26px)' }}>
                <Typography
                  sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, fontWeight: 500 }}
                >
                  <SpeakerOutlinedIcon color="primary" /> Bass volume
                </Typography>
                <Slider
                  aria-label="MiniDSP bass volume"
                  min={config.bassMinDb}
                  max={config.bassMaxDb}
                  step={config.bassStepDb}
                  value={bass}
                  disabled={busy}
                  valueLabelDisplay="on"
                  valueLabelFormat={db}
                  slots={{ thumb: SliderValueThumb }}
                  onChange={(_, value) => setBass(value as number)}
                  onChangeCommitted={(_, value) => void setBassGain(value as number)}
                />
              </Box>
            </Box>

            <Box>
              <Typography
                variant="overline"
                color="text.secondary"
                sx={{ display: 'block', mb: 0.75, ml: 0.5, letterSpacing: '0.12em' }}
              >
                Sound presets
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: {
                    xs: 'repeat(2, minmax(0, 1fr))',
                    sm: `repeat(${Math.min(4, Math.max(1, config.presets.length))}, minmax(0, 1fr))`
                  },
                  gap: 1
                }}
              >
                {config.presets.map((preset) => {
                  const selected = status.preset === preset.index
                  return (
                    <Button
                      key={preset.index}
                      variant={selected ? 'contained' : 'outlined'}
                      color={selected ? 'primary' : 'inherit'}
                      disabled={busy}
                      aria-pressed={selected}
                      onClick={() => void run(() => window.minidsp.selectPreset(preset.index))}
                      sx={{
                        minHeight: 'clamp(48px, 9svh, 68px)',
                        borderRadius: 3,
                        overflow: 'hidden',
                        borderColor: selected ? 'primary.main' : 'divider',
                        fontWeight: selected ? 700 : 500
                      }}
                    >
                      <Typography noWrap>{preset.label}</Typography>
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
