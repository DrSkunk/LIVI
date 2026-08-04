import { Switch } from '@renderer/ui'
import { ChangeEvent } from 'react'
import { SettingsItemRow } from '../settingsItemRow'

type Props = {
  label: string
  checked: boolean
  onChange: (event: ChangeEvent<HTMLInputElement>, checked: boolean) => void
  disabled?: boolean
}

export const SettingsSwitchRow = ({ label, checked, onChange, disabled }: Props) => {
  return (
    <SettingsItemRow label={label}>
      <Switch
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        slotProps={{ input: { 'aria-label': label } }}
      />
    </SettingsItemRow>
  )
}
