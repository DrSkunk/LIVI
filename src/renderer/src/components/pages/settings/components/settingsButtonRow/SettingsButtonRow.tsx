import { Button, CircularProgress } from '@renderer/ui'
import { SettingsItemRow } from '../settingsItemRow'

type Props = {
  label?: string
  buttonLabel: string
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  variant?: 'text' | 'outlined' | 'contained'
}

export const SettingsButtonRow = ({
  label = '',
  buttonLabel,
  onClick,
  disabled,
  loading,
  variant = 'contained'
}: Props) => {
  return (
    <SettingsItemRow label={label}>
      <Button
        variant={variant}
        onClick={onClick}
        disabled={disabled || loading}
        sx={{ minWidth: '7.5rem', flexShrink: 0 }}
      >
        {loading ? <CircularProgress size={18} color="inherit" /> : buttonLabel}
      </Button>
    </SettingsItemRow>
  )
}
