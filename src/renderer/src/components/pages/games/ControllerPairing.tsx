import BluetoothSearchingRoundedIcon from '@mui/icons-material/BluetoothSearchingRounded'
import SportsEsportsRoundedIcon from '@mui/icons-material/SportsEsportsRounded'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItem,
  ListItemIcon,
  ListItemText
} from '@mui/material'
import type { BluetoothControllerDevice } from '@shared/types'
import { useCallback, useEffect, useRef, useState } from 'react'

export function ControllerPairing() {
  const [open, setOpen] = useState(false)
  const [devices, setDevices] = useState<BluetoothControllerDevice[]>([])
  const [scanning, setScanning] = useState(false)
  const [pairingMac, setPairingMac] = useState('')
  const [error, setError] = useState('')
  const requestId = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      requestId.current++
    }
  }, [])

  const refresh = useCallback(async (scan: boolean) => {
    const id = ++requestId.current
    setScanning(scan)
    setError('')
    try {
      const next = scan
        ? await window.games.scanControllers()
        : await window.games.listControllers()
      if (mounted.current && id === requestId.current) setDevices(next)
    } catch (cause) {
      if (mounted.current && id === requestId.current) {
        setError(cause instanceof Error ? cause.message : 'Could not access Bluetooth')
      }
    } finally {
      if (mounted.current && id === requestId.current) setScanning(false)
    }
  }, [])

  const show = () => {
    setOpen(true)
    void refresh(false)
  }

  const close = () => {
    requestId.current++
    setScanning(false)
    setOpen(false)
  }

  const pair = async (device: BluetoothControllerDevice) => {
    setPairingMac(device.mac)
    setError('')
    try {
      await window.games.pairController(device.mac)
      await refresh(false)
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : 'Controller pairing failed')
      }
    } finally {
      if (mounted.current) setPairingMac('')
    }
  }

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<SportsEsportsRoundedIcon />}
        onClick={show}
        disabled={window.app?.platform !== undefined && window.app.platform !== 'linux'}
      >
        Pair controller
      </Button>

      <Dialog open={open} onClose={() => !pairingMac && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Bluetooth controllers</DialogTitle>
        <DialogContent>
          <Box sx={{ color: 'text.secondary', mb: 2 }}>
            Put controller in pairing mode, then scan. LIVI pairs, trusts, and connects it for
            RetroArch automatically.
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          {devices.length === 0 && !scanning && (
            <Box sx={{ color: 'text.secondary', textAlign: 'center', py: 3 }}>
              No controllers found
            </Box>
          )}
          <List>
            {devices.map((device) => {
              const busy = pairingMac === device.mac
              return (
                <ListItem
                  key={device.mac}
                  secondaryAction={
                    <Button
                      variant={device.paired ? 'outlined' : 'contained'}
                      disabled={device.paired || Boolean(pairingMac) || scanning}
                      onClick={() => void pair(device)}
                    >
                      {busy ? (
                        <CircularProgress size={20} color="inherit" />
                      ) : device.paired ? (
                        'Paired'
                      ) : (
                        'Pair'
                      )}
                    </Button>
                  }
                >
                  <ListItemIcon>
                    <SportsEsportsRoundedIcon color={device.connected ? 'success' : 'inherit'} />
                  </ListItemIcon>
                  <ListItemText
                    primary={device.name || 'Bluetooth controller'}
                    secondary={`${device.mac}${device.connected ? ' · Connected' : ''}`}
                  />
                </ListItem>
              )
            })}
          </List>
        </DialogContent>
        <DialogActions>
          <Button
            startIcon={
              scanning ? <CircularProgress size={18} /> : <BluetoothSearchingRoundedIcon />
            }
            onClick={() => void refresh(true)}
            disabled={scanning || Boolean(pairingMac)}
          >
            {scanning ? 'Scanning…' : 'Scan'}
          </Button>
          <Button onClick={close} disabled={Boolean(pairingMac)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
