import { useTheme } from '@renderer/ui'
import { PauseIcon, PlayArrowIcon, SkipNextIcon, SkipPreviousIcon } from '@renderer/ui/icons'
import type React from 'react'
import { RefObject, SetStateAction, useState } from 'react'
import { circleBtnStyle } from '../styles'

type ControlsProps = {
  ctrlGap: number
  ctrlSize: number
  prevBtnRef: RefObject<HTMLButtonElement | null>
  playBtnRef: RefObject<HTMLButtonElement | null>
  nextBtnRef: RefObject<HTMLButtonElement | null>
  onSetFocus: (
    focus: SetStateAction<{
      play: boolean
      next: boolean
      prev: boolean
    }>
  ) => void
  onPrev: () => void
  onPlayPause: () => void
  onNext: () => void
  uiPlaying: boolean
  press: {
    play?: boolean
    next?: boolean
    prev?: boolean
  }
  focus: {
    play?: boolean
    next?: boolean
    prev?: boolean
  }
  iconPx: number
}

export const Controls = ({
  ctrlGap,
  ctrlSize,
  prevBtnRef,
  playBtnRef,
  nextBtnRef,
  onSetFocus: setFocus,
  onPrev,
  onPlayPause,
  onNext,
  uiPlaying,
  press,
  focus,
  iconPx
}: ControlsProps) => {
  const theme = useTheme()
  const ringColor = theme.palette.primary.main

  const [hover, setHover] = useState<{ play: boolean; next: boolean; prev: boolean }>({
    play: false,
    next: false,
    prev: false
  })

  const hoverProps = (
    key: 'play' | 'next' | 'prev'
  ): {
    onPointerEnter: (e: React.PointerEvent<HTMLButtonElement>) => void
    onPointerLeave: () => void
  } => ({
    onPointerEnter: (e) => {
      if (e.pointerType === 'mouse') setHover((h) => ({ ...h, [key]: true }))
    },
    onPointerLeave: () => setHover((h) => ({ ...h, [key]: false }))
  })

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        justifyContent: 'center'
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: ctrlGap,
          alignItems: 'center',
          height: ctrlSize
        }}
      >
        {/* PREVIOUS */}
        <button
          ref={prevBtnRef}
          onMouseUp={(e) => (e.currentTarget as HTMLButtonElement).blur()}
          onFocus={() => setFocus((f) => ({ ...f, prev: true }))}
          onBlur={() => setFocus((f) => ({ ...f, prev: false }))}
          {...hoverProps('prev')}
          onClick={onPrev}
          aria-label="Previous"
          style={circleBtnStyle(ctrlSize, {
            pressed: !!press.prev,
            focused: !!focus.prev,
            hovered: hover.prev,
            ringColor
          })}
        >
          <SkipPreviousIcon sx={{ fontSize: iconPx, display: 'block', lineHeight: 0 }} />
        </button>

        {/* PLAY / PAUSE */}
        <button
          ref={playBtnRef}
          onMouseUp={(e) => (e.currentTarget as HTMLButtonElement).blur()}
          onFocus={() => setFocus((f) => ({ ...f, play: true }))}
          onBlur={() => setFocus((f) => ({ ...f, play: false }))}
          {...hoverProps('play')}
          onClick={onPlayPause}
          aria-label="Play/Pause"
          aria-pressed={uiPlaying}
          style={circleBtnStyle(ctrlSize, {
            pressed: !!press.play,
            focused: !!focus.play,
            hovered: hover.play,
            ringColor
          })}
        >
          {uiPlaying ? (
            <PauseIcon sx={{ fontSize: iconPx, display: 'block', lineHeight: 0 }} />
          ) : (
            <PlayArrowIcon
              sx={{
                fontSize: iconPx,
                display: 'block',
                lineHeight: 0,
                transform: 'translateX(1px)'
              }}
            />
          )}
        </button>

        {/* NEXT */}
        <button
          ref={nextBtnRef}
          onMouseUp={(e) => (e.currentTarget as HTMLButtonElement).blur()}
          onFocus={() => setFocus((f) => ({ ...f, next: true }))}
          onBlur={() => setFocus((f) => ({ ...f, next: false }))}
          {...hoverProps('next')}
          onClick={onNext}
          aria-label="Next"
          style={circleBtnStyle(ctrlSize, {
            pressed: !!press.next,
            focused: !!focus.next,
            hovered: hover.next,
            ringColor
          })}
        >
          <SkipNextIcon sx={{ fontSize: iconPx, display: 'block', lineHeight: 0 }} />
        </button>
      </div>
    </div>
  )
}
