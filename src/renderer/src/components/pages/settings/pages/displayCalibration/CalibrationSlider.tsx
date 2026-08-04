import { Box, IconButton, Slider } from '@renderer/ui'
import { RestartAltOutlinedIcon } from '@renderer/ui/icons'
import { type ReactNode, useEffect, useState } from 'react'

type Props = {
  label: string
  value: number
  min: number
  max: number
  step?: number
  defaultValue?: number
  swatch?: string
  icon?: ReactNode
  onChange?: (v: number) => void
  onCommit: (v: number) => void
}

// Slider with a local draft while dragging, saved once on release.
export function CalibrationSlider({
  label,
  value,
  min,
  max,
  step = 0.01,
  defaultValue = 1,
  swatch,
  icon,
  onChange,
  onCommit
}: Props) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])

  const reset = () => {
    setDraft(defaultValue)
    onChange?.(defaultValue)
    onCommit(defaultValue)
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0 }}>
      <Box sx={{ position: 'relative', display: 'flex', flex: 1, minWidth: 0, ml: 2 }}>
        <Slider
          min={min}
          max={max}
          step={step}
          value={draft}
          onChange={(_: unknown, value: number | number[]) => {
            const next = Array.isArray(value) ? value[0] : value
            setDraft(next)
            onChange?.(next)
          }}
          onChangeCommitted={(_: unknown, value: number | number[]) =>
            onCommit(Array.isArray(value) ? value[0] : value)
          }
          sx={{ flex: 1, minWidth: 0, ...(swatch ? { color: swatch } : {}) }}
        />
        {icon && (
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              left: '0.9em',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              pointerEvents: 'none',
              color: '#fff',
              '& .MuiSvgIcon-root': { fontSize: 'clamp(1rem, 2.6svh, 1.3rem)' }
            }}
          >
            {icon}
          </Box>
        )}
      </Box>
      <IconButton
        size="small"
        aria-label={label}
        disabled={draft === defaultValue}
        onClick={reset}
        sx={{ p: 0.25, flex: 'none' }}
      >
        <RestartAltOutlinedIcon fontSize="small" />
      </IconButton>
    </Box>
  )
}
