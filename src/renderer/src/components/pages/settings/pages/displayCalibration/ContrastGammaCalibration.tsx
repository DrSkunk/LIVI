import ContrastRounded from '@mui/icons-material/ContrastRounded'
import TonalityRounded from '@mui/icons-material/TonalityRounded'
import { Box, Stack } from '@mui/material'
import type { SettingsCustomPageProps } from '@renderer/routes/types'
import type { Config } from '@shared/types'
import { useLiviStore } from '@store/store'
import { useEffect, useState } from 'react'
import { CalibrationFilter } from './CalibrationFilter'
import { CalibrationSlider } from './CalibrationSlider'
import { CALIBRATION_MAX, CALIBRATION_MIN } from './calibration'

const STEPS = 16
const FILTER_ID = 'cal-contrast-gamma'

// Grayscale step wedge to judge contrast/gamma coverage, plus the two sliders.
export function ContrastGammaCalibration(_props: SettingsCustomPageProps<Config, unknown>) {
  const settings = useLiviStore((s) => s.settings) as Config | null
  const saveSettings = useLiviStore((s) => s.saveSettings)

  const gamma = settings?.displayGamma ?? 1
  const contrast = settings?.displayContrast ?? 1
  const r = settings?.displayColorR ?? 1
  const g = settings?.displayColorG ?? 1
  const b = settings?.displayColorB ?? 1

  const [liveGamma, setLiveGamma] = useState(gamma)
  const [liveContrast, setLiveContrast] = useState(contrast)
  useEffect(() => setLiveGamma(gamma), [gamma])
  useEffect(() => setLiveContrast(contrast), [contrast])

  const update = (patch: Partial<Config>) => {
    if (settings) saveSettings({ ...settings, ...patch })
  }

  const wedge = Array.from({ length: STEPS }, (_, i) => {
    const c = Math.round((i / (STEPS - 1)) * 255)
    return `rgb(${c},${c},${c})`
  })

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
        gamma={liveGamma}
        contrast={liveContrast}
        gainR={r}
        gainG={g}
        gainB={b}
      />
      <Box
        sx={{
          flex: '0 0 auto',
          display: 'flex',
          borderRadius: 1,
          overflow: 'hidden',
          filter: `url(#${FILTER_ID})`
        }}
      >
        {wedge.map((c, i) => (
          <Box key={i} sx={{ flex: 1, backgroundColor: c }} />
        ))}
      </Box>
      <Stack spacing={1.5} sx={{ px: 1 }}>
        <CalibrationSlider
          label="Gamma"
          icon={<TonalityRounded />}
          value={gamma}
          min={CALIBRATION_MIN}
          max={CALIBRATION_MAX}
          onChange={setLiveGamma}
          onCommit={(v) => update({ displayGamma: v })}
        />
        <CalibrationSlider
          label="Contrast"
          icon={<ContrastRounded />}
          value={contrast}
          min={CALIBRATION_MIN}
          max={CALIBRATION_MAX}
          onChange={setLiveContrast}
          onCommit={(v) => update({ displayContrast: v })}
        />
      </Stack>
    </Box>
  )
}
