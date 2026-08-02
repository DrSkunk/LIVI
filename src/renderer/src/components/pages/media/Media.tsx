import { useStatusStore } from '@store/store'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Controls, ProgressBar } from './components'
import { FFTSpectrum } from './components/createFFTSpectrum'
import { MIN_TEXT_COL } from './constants'
import { useElementSize, useMediaState, useOptimisticPlaying, usePressFeedback } from './hooks'
import { MediaEventType, UsbEvent } from './types'
import { clamp } from './utils'
import { flash } from './utils/flash'
import { mediaControlOps } from './utils/mediaControllOps'
import { mediaLayoutArtworksOps } from './utils/mediaLayoutArtworksOps'
import { mediaProjectionOps } from './utils/mediaProjectionOps'
import { mediaScaleOps } from './utils/mediaScaleOps'

type MediaProps = { forceHydrate?: boolean }

export const Media = ({ forceHydrate = false }: MediaProps = {}) => {
  const isStreaming = useStatusStore((s: { isStreaming: boolean }) => s.isStreaming)

  const [rootRef, { w, h }] = useElementSize<HTMLDivElement>()
  const { snap, livePlayMs } = useMediaState(forceHydrate || isStreaming)

  // Scales (base)
  const { titlePx, artistPx, albumPx, pagePad, colGap, sectionGap, ctrlSize, ctrlGap, progressH } =
    mediaScaleOps({ w, h })

  // Tiny-screen helpers (e.g. 320x240)
  const isTinyHeight = h > 0 && h <= 320
  const textScale = isTinyHeight ? 0.88 : 1

  // Clamp padding on tiny screens, otherwise the progress bar has no space left
  const pagePadClamped = isTinyHeight ? Math.min(pagePad, 10) : pagePad

  const titlePxScaled = Math.max(12, Math.round(titlePx * textScale))
  const artistPxScaled = Math.max(11, Math.round(artistPx * textScale))
  const albumPxScaled = Math.max(10, Math.round(albumPx * textScale))
  const appPxScaled = Math.max(10, Math.round(12 * textScale))

  // Slightly slimmer bar on tiny screens
  const progressHScaled = Math.max(6, Math.round(progressH * (isTinyHeight ? 0.85 : 1)))

  // Compute usable inner width (hard clamp) for anything that must not overflow
  const innerMaxWidth = Math.max(0, Math.floor(w - pagePadClamped * 2))

  // Layout + artwork
  const { canTwoCol, artPx } = mediaLayoutArtworksOps({
    ctrlSize,
    progressH: progressHScaled,
    w,
    h,
    pagePad: pagePadClamped,
    colGap,
    titlePx: titlePxScaled,
    artistPx: artistPxScaled,
    albumPx: albumPxScaled
  })

  // Media projection
  const {
    mediaPayloadError,
    title,
    artist,
    album,
    appName,
    durationMs,
    realPlaying,
    imageDataUrl
  } = mediaProjectionOps({ snap })

  const { uiPlaying, setOverride, clearOverride } = useOptimisticPlaying(
    realPlaying,
    mediaPayloadError
  )
  const { press, bump, reset: resetPress } = usePressFeedback()

  // Spectrum is part of the player, so request PCM while this page is mounted.
  useEffect(() => {
    window.projection?.ipc?.setVisualizerEnabled?.(true)
    return () => window.projection?.ipc?.setVisualizerEnabled?.(false)
  }, [])

  // Per-button focus
  const [focus, setFocus] = useState<{ play: boolean; next: boolean; prev: boolean }>({
    play: false,
    next: false,
    prev: false
  })

  // Refs for visual flash
  const prevBtnRef = useRef<HTMLButtonElement | null>(null)
  const playBtnRef = useRef<HTMLButtonElement | null>(null)
  const nextBtnRef = useRef<HTMLButtonElement | null>(null)

  // Backward-jump guard controls
  const prevElapsedRef = useRef(0)
  const allowBackwardOnceRef = useRef(false)

  const { onPlayPause, onPrev, onNext } = mediaControlOps({
    uiPlaying,
    onBump: bump,
    playBtnRef,
    prevBtnRef,
    allowBackwardOnceRef,
    nextBtnRef,
    setOverride
  })

  useEffect(() => {
    const handler = (e: Event) => {
      const cmdRaw = (e as CustomEvent<{ command?: string }>).detail?.command
      if (!cmdRaw) return

      const cmd = cmdRaw.toLowerCase()

      const isPlayLike =
        cmd === MediaEventType.PLAY ||
        cmd === MediaEventType.PAUSE ||
        cmd === MediaEventType.STOP ||
        cmd === MediaEventType.PLAYPAUSE

      if (isPlayLike) {
        bump(MediaEventType.PLAY)
        flash(playBtnRef)
        return
      }

      if (cmd === MediaEventType.NEXT) {
        bump(MediaEventType.NEXT)
        flash(nextBtnRef)
        return
      }

      if (cmd === MediaEventType.PREV) {
        bump(MediaEventType.PREV)
        flash(prevBtnRef)
        allowBackwardOnceRef.current = true
        return
      }
    }

    window.addEventListener('car-media-key', handler as EventListener)
    return () => window.removeEventListener('car-media-key', handler as EventListener)
  }, [bump])

  // Clear overrides on session change
  useEffect(() => {
    const handler = (_evt: unknown, ...args: unknown[]) => {
      const data = (args[0] ?? {}) as UsbEvent
      if (data?.type === 'media-reset') {
        clearOverride()
        resetPress()
      }
    }
    const unsubscribe = window.projection.ipc.onEvent(handler)
    return unsubscribe
  }, [clearOverride, resetPress])

  // Progress from elapsed/total
  const elapsedMs = Math.max(0, livePlayMs || 0)
  const totalMs = Math.max(0, durationMs || 0)
  const lastProgressRef = useRef(0)
  const lastTrackSigRef = useRef<string>('')

  const trackSig = useMemo(
    () => [title, artist, album, totalMs].join('␟'),
    [title, artist, album, totalMs]
  )

  if (trackSig !== lastTrackSigRef.current) {
    lastTrackSigRef.current = trackSig
    lastProgressRef.current = 0
    prevElapsedRef.current = 0
  }

  const prevElapsed = prevElapsedRef.current
  const isRestart = allowBackwardOnceRef.current || prevElapsed - elapsedMs > 500

  let progress = totalMs > 0 ? elapsedMs / totalMs : 0

  // Block jitter while playing, but allow explicit restarts/back
  if (realPlaying && !isRestart && progress + 0.001 < lastProgressRef.current) {
    progress = lastProgressRef.current
  }

  progress = clamp(progress, 0, 1)
  lastProgressRef.current = progress
  prevElapsedRef.current = elapsedMs
  allowBackwardOnceRef.current = false

  const pct = Math.round(progress * 1000) / 10

  const iconPx = Math.round(ctrlSize * 0.46)

  // Slightly reduce side padding for text on tiny screens
  const textSidePad = Math.max(6, Math.round(pagePadClamped * 0.75))

  const ART_ROUND = canTwoCol ? 34 : 18
  const spectrumH = Math.max(
    isTinyHeight ? 42 : 64,
    Math.min(isTinyHeight ? 54 : 110, Math.round(h * (isTinyHeight ? 0.18 : 0.16)))
  )

  const Artwork = (
    <div
      style={{
        width: artPx,
        height: artPx,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none'
      }}
    >
      <div
        className="artwork-surface"
        style={{
          width: '100%',
          height: '100%',
          borderRadius: ART_ROUND,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        {imageDataUrl ? (
          <img
            src={imageDataUrl}
            alt="Cover"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            draggable={false}
          />
        ) : (
          <div style={{ opacity: 0.6, fontSize: 12 }}>No Artwork</div>
        )}
      </div>
    </div>
  )

  return (
    <div
      id="media-root"
      ref={rootRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        paddingTop: pagePadClamped,
        paddingLeft: pagePadClamped,
        paddingRight: pagePadClamped,
        paddingBottom: isTinyHeight ? 2 : pagePadClamped,
        boxSizing: 'border-box',
        overflow: 'hidden'
      }}
    >
      {/* CONTENT */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {canTwoCol ? (
          <div
            style={{
              height: '100%',
              display: 'grid',
              gridTemplateColumns: `minmax(${MIN_TEXT_COL}px, 1fr) ${artPx}px`,
              alignItems: 'center',
              columnGap: colGap,
              minHeight: 0
            }}
          >
            <div
              style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: sectionGap,
                minHeight: 0,
                paddingLeft: textSidePad
              }}
            >
              <div style={{ maxWidth: innerMaxWidth, overflow: 'hidden' }}>
                <div
                  style={{
                    fontSize: `${titlePxScaled}px`,
                    fontWeight: 800,
                    lineHeight: 1.08,
                    letterSpacing: 0.2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {title}
                </div>
                <div
                  style={{
                    opacity: 0.9,
                    fontSize: `${artistPxScaled}px`,
                    marginTop: 8,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {artist}
                </div>
                <div
                  style={{
                    opacity: 0.7,
                    fontSize: `${albumPxScaled}px`,
                    marginTop: 4,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {album}
                </div>
                <div style={{ opacity: 0.55, fontSize: appPxScaled, marginTop: 4 }}>{appName}</div>
              </div>
            </div>

            <div style={{ marginLeft: 'auto' }}>{Artwork}</div>
          </div>
        ) : (
          <div
            style={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap: sectionGap,
              minHeight: 0,
              paddingLeft: textSidePad,
              paddingRight: textSidePad
            }}
          >
            <div style={{ maxWidth: innerMaxWidth, overflow: 'hidden' }}>
              <div
                style={{
                  fontSize: `${titlePxScaled}px`,
                  fontWeight: 800,
                  lineHeight: 1.08,
                  letterSpacing: 0.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}
              >
                {title}
              </div>

              <div style={{ opacity: 0.55, fontSize: appPxScaled, marginTop: 4 }}>
                {!artist ? appName : artist}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ALWAYS-ON SPECTRUM ANALYZER */}
      <div
        role="img"
        aria-label="Spectrum analyzer"
        style={{
          position: 'relative',
          flex: '0 0 auto',
          width: '100%',
          height: spectrumH,
          marginBottom: isTinyHeight ? 3 : 8,
          overflow: 'hidden',
          borderRadius: isTinyHeight ? 10 : 18,
          boxSizing: 'border-box',
          background:
            'linear-gradient(180deg, color-mix(in srgb, var(--ui-primary) 8%, transparent), transparent)',
          border: '1px solid color-mix(in srgb, var(--ui-primary) 18%, transparent)'
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: isTinyHeight ? '3px 6px' : '6px 12px',
            opacity: uiPlaying ? 1 : 0.55,
            transition: 'opacity 180ms ease'
          }}
        >
          <Suspense fallback={null}>
            <FFTSpectrum />
          </Suspense>
        </div>
        {!isTinyHeight && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 12,
              zIndex: 3,
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: '0.16em',
              opacity: 0.55,
              pointerEvents: 'none'
            }}
          >
            LIVE SPECTRUM
          </div>
        )}
      </div>

      {/* BOTTOM DOCK */}
      <div
        style={{
          display: 'grid',
          gridAutoRows: 'auto',
          rowGap: isTinyHeight ? 3 : 4,
          paddingBottom: isTinyHeight ? 0 : '0.5rem',
          width: '100%',
          boxSizing: 'border-box'
        }}
      >
        {/* Always center controls */}
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
          <Controls
            ctrlGap={ctrlGap}
            ctrlSize={ctrlSize}
            prevBtnRef={prevBtnRef}
            playBtnRef={playBtnRef}
            nextBtnRef={nextBtnRef}
            onSetFocus={setFocus}
            onPrev={onPrev}
            onPlayPause={onPlayPause}
            onNext={onNext}
            uiPlaying={uiPlaying}
            press={press}
            focus={focus}
            iconPx={iconPx}
          />
        </div>

        {/* Always render progress bar */}
        <div style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
          <ProgressBar
            elapsedMs={elapsedMs}
            progressH={progressHScaled}
            totalMs={totalMs}
            pct={pct}
          />
        </div>
      </div>
    </div>
  )
}
