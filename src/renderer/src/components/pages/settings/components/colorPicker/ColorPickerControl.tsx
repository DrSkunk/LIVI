import { Box, IconButton, Slider, Typography } from '@renderer/ui'
import { RestartAltOutlinedIcon } from '@renderer/ui/icons'
import type { Config } from '@shared/types'
import { type CSSProperties, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsNode } from '../../../../../routes'
import { defaultColorForPath, type Hsl, hexToHsl, hslToHex } from './colorUtils'

type Props = {
  node: SettingsNode<Config>
  value: unknown
  onChange: (v: unknown) => void
}

const RAIL_HEIGHT = 'clamp(12px, 2.4svh, 18px)'

const HUE_GRADIENT =
  'linear-gradient(to right, hsl(0 100% 50%), hsl(60 100% 50%), hsl(120 100% 50%), ' +
  'hsl(180 100% 50%), hsl(240 100% 50%), hsl(300 100% 50%), hsl(360 100% 50%))'

// MUI slider with the full gradient on the rail, no filled track
const sliderSx = {
  width: 'calc(100% - 48px)',
  mx: 3,
  display: 'block',
  '& .MuiSlider-rail': {
    opacity: 1,
    height: RAIL_HEIGHT,
    borderRadius: '999px',
    background: 'var(--livi-rail-gradient)'
  },
  '& .MuiSlider-track': { display: 'none' },
  '& .MuiSlider-thumb': {
    width: 'clamp(22px, 4svh, 28px)',
    height: 'clamp(22px, 4svh, 28px)',
    backgroundColor: '#fff',
    border: '2px solid rgba(0,0,0,0.35)'
  }
}

export const ColorPickerControl = ({ node, value, onChange }: Props) => {
  const { t } = useTranslation()

  const path = 'path' in node ? node.path : undefined
  const hasCustom = value != null && String(value).trim() !== ''
  const effectiveHex = hasCustom ? String(value) : defaultColorForPath(path)

  // Local HSL keeps hue/saturation stable across the lossy hex roundtrip while dragging.
  // Dragging only updates the local preview, the value is saved once on release.
  const lastEmitted = useRef<string | null>(null)
  const [hsl, setHsl] = useState<Hsl>(() => hexToHsl(effectiveHex))
  const [draftHex, setDraftHex] = useState<string | null>(null)
  const [seenHex, setSeenHex] = useState(effectiveHex)
  if (effectiveHex !== seenHex) {
    setSeenHex(effectiveHex)
    if (effectiveHex !== lastEmitted.current) {
      lastEmitted.current = null
      setDraftHex(null)
      setHsl(hexToHsl(effectiveHex))
    }
  }

  const preview = (next: Hsl) => {
    setHsl(next)
    setDraftHex(hslToHex(next))
  }

  const commit = (next: Hsl) => {
    setHsl(next)
    const nextHex = hslToHex(next)
    setDraftHex(nextHex)
    lastEmitted.current = nextHex
    onChange(nextHex)
  }

  const reset = () => {
    lastEmitted.current = null
    setDraftHex(null)
    setHsl(hexToHsl(defaultColorForPath(path)))
    onChange(null)
  }

  const hex = draftHex ?? effectiveHex

  const rows: Array<{ key: string; label: string; max: number; val: number; bg: string }> = [
    { key: 'h', label: t('settings.colorHue'), max: 359, val: hsl.h, bg: HUE_GRADIENT },
    {
      key: 's',
      label: t('settings.colorSaturation'),
      max: 100,
      val: hsl.s,
      bg: `linear-gradient(to right, hsl(${hsl.h} 0% ${hsl.l}%), hsl(${hsl.h} 100% ${hsl.l}%))`
    },
    {
      key: 'l',
      label: t('settings.colorLightness'),
      max: 100,
      val: hsl.l,
      bg: `linear-gradient(to right, #000, hsl(${hsl.h} ${hsl.s}% 50%), #fff)`
    }
  ]

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 'clamp(8px, 2svh, 20px)', pt: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Box
          sx={{
            flex: 1,
            height: 'clamp(44px, 9svh, 72px)',
            borderRadius: 2,
            border: '1px solid',
            borderColor: 'divider'
          }}
          style={{ backgroundColor: hex }}
        />
        <Typography sx={{ fontFamily: 'monospace', minWidth: '7ch' }}>
          {hex.toUpperCase()}
        </Typography>
        <IconButton size="small" disabled={!hasCustom} onClick={reset}>
          <RestartAltOutlinedIcon fontSize="small" />
        </IconButton>
      </Box>

      {rows.map((row) => (
        <Box key={row.key}>
          <Typography color="text.secondary" sx={{ fontSize: '0.85em', mb: 0.5, ml: 3 }}>
            {row.label}
          </Typography>
          <Slider
            value={row.val}
            min={0}
            max={row.max}
            step={1}
            valueLabelDisplay="off"
            onChange={(_event: unknown, value: number | number[]) =>
              preview({ ...hsl, [row.key]: Array.isArray(value) ? value[0] : value })
            }
            onChangeCommitted={(_event: unknown, value: number | number[]) =>
              commit({ ...hsl, [row.key]: Array.isArray(value) ? value[0] : value })
            }
            sx={sliderSx}
            style={{ '--livi-rail-gradient': row.bg } as CSSProperties}
          />
        </Box>
      ))}
    </Box>
  )
}
