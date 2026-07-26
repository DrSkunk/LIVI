import { Typography } from '@mui/material'
import { ReactNode } from 'react'
import { SettingsItemRow } from '../settingsItemRow'

type Props = {
  label: string
  value: ReactNode
}

export const SettingsValueRow = ({ label, value }: Props) => {
  return (
    <SettingsItemRow label={label}>
      <Typography
        component="span"
        sx={{ color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}
      >
        {value}
      </Typography>
    </SettingsItemRow>
  )
}
