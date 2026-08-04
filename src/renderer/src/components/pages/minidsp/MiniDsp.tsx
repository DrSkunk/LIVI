import type { MiniDspStatus } from '@shared/types'
import { useLiviStore } from '@store/store'
import { useCallback, useEffect, useRef, useState } from 'react'
import { MiniDspView } from './MiniDspView'

const cleanError = (value: unknown) =>
  (value instanceof Error ? value.message : String(value)).replace(
    /^Error invoking remote method '[^']+': Error: /,
    ''
  )

export const MiniDsp = () => {
  const settings = useLiviStore((state) => state.settings)
  const saveSettings = useLiviStore((state) => state.saveSettings)
  const config = settings?.minidsp
  const [status, setStatus] = useState<MiniDspStatus | null>(null)
  const [volume, setVolume] = useState(config?.volumeMinDb ?? -80)
  const [bass, setBass] = useState(config?.bassGainDb ?? 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(false)
  const refreshInFlight = useRef<Promise<void> | null>(null)
  const refreshQueued = useRef(false)
  const actionInFlight = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      refreshQueued.current = false
    }
  }, [])

  const refresh = useCallback((): Promise<void> => {
    if (refreshInFlight.current) {
      refreshQueued.current = true
      return refreshInFlight.current
    }

    const request = (async () => {
      do {
        refreshQueued.current = false
        try {
          const next = await window.minidsp.getStatus()
          if (!mounted.current) return
          setStatus(next)
          if (next.connected) setVolume(next.volumeDb)
          setError('')
        } catch (cause) {
          if (!mounted.current) return
          setError(cleanError(cause))
        }
      } while (mounted.current && refreshQueued.current)
    })().finally(() => {
      if (refreshInFlight.current === request) refreshInFlight.current = null
    })

    refreshInFlight.current = request
    return request
  }, [])

  useEffect(() => {
    if (!config?.enabled) return
    void refresh()
    const timer = window.setInterval(() => {
      if (!actionInFlight.current) void refresh()
    }, 5000)
    return () => window.clearInterval(timer)
  }, [config?.enabled, refresh])

  useEffect(() => setBass(config?.bassGainDb ?? 0), [config?.bassGainDb])

  if (!config) return null

  const run = async (action: () => Promise<void>) => {
    if (actionInFlight.current) return
    actionInFlight.current = true
    setBusy(true)
    setError('')
    try {
      await action()
      await refresh()
    } catch (cause) {
      if (mounted.current) setError(cleanError(cause))
    } finally {
      actionInFlight.current = false
      if (mounted.current) setBusy(false)
    }
  }

  const commitBass = (value: number) =>
    run(async () => {
      await window.minidsp.setBassGain(value)
      await saveSettings({ minidsp: { ...config, bassGainDb: value } })
    })

  return (
    <MiniDspView
      config={config}
      status={status}
      volume={volume}
      bass={bass}
      busy={busy}
      error={error}
      onRefresh={() => void refresh()}
      onVolumeChange={setVolume}
      onVolumeCommit={(next) => void run(() => window.minidsp.setVolume(next))}
      onBassChange={setBass}
      onBassCommit={(next) => void commitBass(next)}
      onPresetSelect={(preset) => void run(() => window.minidsp.selectPreset(preset))}
    />
  )
}
