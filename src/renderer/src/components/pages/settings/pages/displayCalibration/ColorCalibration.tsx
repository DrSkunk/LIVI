import { Box, Stack } from '@mui/material'
import type { SettingsCustomPageProps } from '@renderer/routes/types'
import type { Config } from '@shared/types'
import { useLiviStore } from '@store/store'
import { useEffect, useState } from 'react'
import { CalibrationFilter } from './CalibrationFilter'
import { CalibrationSlider } from './CalibrationSlider'
import { CALIBRATION_MAX, CALIBRATION_MIN } from './calibration'

const FILTER_ID = 'cal-color'

// Saturated R/G/B bars plus the additive white/gray sum, plus per-channel sliders.
export function ColorCalibration(_props: SettingsCustomPageProps<Config, unknown>) {
  const settings = useLiviStore((s) => s.settings) as Config | null
  const saveSettings = useLiviStore((s) => s.saveSettings)

  const r = settings?.displayColorR ?? 1
  const g = settings?.displayColorG ?? 1
  const b = settings?.displayColorB ?? 1
  const gamma = settings?.displayGamma ?? 1
  const contrast = settings?.displayContrast ?? 1

  const [liveR, setLiveR] = useState(r)
  const [liveG, setLiveG] = useState(g)
  const [liveB, setLiveB] = useState(b)
  useEffect(() => setLiveR(r), [r])
  useEffect(() => setLiveG(g), [g])
  useEffect(() => setLiveB(b), [b])

  const update = (patch: Partial<Config>) => {
    if (settings) saveSettings({ ...settings, ...patch })
  }

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 1.5
      }}
    >
      <CalibrationFilter
        id={FILTER_ID}
        gamma={gamma}
        contrast={contrast}
        gainR={liveR}
        gainG={liveG}
        gainB={liveB}
      />
      <Box
        sx={{
          flex: '0 0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          filter: `url(#${FILTER_ID})`
        }}
      >
        <Box sx={{ flex: 1, display: 'flex', gap: 1 }}>
          <Box sx={{ flex: 1, backgroundColor: '#ff0000', borderRadius: 1 }} />
          <Box sx={{ flex: 1, backgroundColor: '#00ff00', borderRadius: 1 }} />
          <Box sx={{ flex: 1, backgroundColor: '#0000ff', borderRadius: 1 }} />
        </Box>
        <Box sx={{ flex: 1, display: 'flex', gap: 1 }}>
          <Box sx={{ flex: 1, backgroundColor: '#ffffff', borderRadius: 1 }} />
          <Box sx={{ flex: 1, backgroundColor: '#808080', borderRadius: 1 }} />
        </Box>
      </Box>
      <Stack spacing={1.5} sx={{ px: 1 }}>
        <CalibrationSlider
          label="Red"
          swatch="#ff0000"
          value={r}
          min={CALIBRATION_MIN}
          max={CALIBRATION_MAX}
          onChange={setLiveR}
          onCommit={(v) => update({ displayColorR: v })}
        />
        <CalibrationSlider
          label="Green"
          swatch="#00ff00"
          value={g}
          min={CALIBRATION_MIN}
          max={CALIBRATION_MAX}
          onChange={setLiveG}
          onCommit={(v) => update({ displayColorG: v })}
        />
        <CalibrationSlider
          label="Blue"
          swatch="#0000ff"
          value={b}
          min={CALIBRATION_MIN}
          max={CALIBRATION_MAX}
          onChange={setLiveB}
          onCommit={(v) => update({ displayColorB: v })}
        />
      </Stack>
    </Box>
  )
}
