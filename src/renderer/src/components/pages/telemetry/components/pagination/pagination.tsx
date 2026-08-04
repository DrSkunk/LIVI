import { usePaginationDots } from '@renderer/components/pages/telemetry/hooks/usePaginationDots'
import { Box, useTheme } from '@renderer/ui'
import type { FC, KeyboardEvent, PointerEvent } from 'react'
import { DashboardsPaginationProps } from './types'

export const DashboardsPagination: FC<DashboardsPaginationProps> = ({
  activeIndex,
  dotsLength,
  onSetIndex,
  isNavbarHidden,
  isNavPresent
}) => {
  const theme = useTheme()

  const { showDots, revealDots } = usePaginationDots(isNavbarHidden, isNavPresent)

  return (
    <Box
      sx={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 'clamp(10px, 2.2svh, 18px)',
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: showDots ? 'auto' : 'none',
        opacity: showDots ? 1 : 0,
        transform: showDots ? 'translateY(0)' : 'translateY(160%)',
        transition: 'opacity 220ms ease, transform 220ms ease'
      }}
    >
      <Box
        sx={{
          display: 'flex',
          gap: 'clamp(6px, 1.2svh, 10px)',
          px: 'clamp(10px, 2svh, 14px)',
          py: 'clamp(6px, 1.4svh, 10px)',
          borderRadius: 999,
          backgroundColor: theme.palette.mode === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.30)'
        }}
      >
        {Array(dotsLength)
          .fill(null)
          .map((_, i) => (
            <Box
              key={i}
              role="button"
              tabIndex={0}
              onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
                event.preventDefault()
                event.stopPropagation()
                onSetIndex(i)
                revealDots()
              }}
              onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  event.stopPropagation()
                  onSetIndex(i)
                  revealDots()
                }
              }}
              sx={{
                width: 'clamp(14px, 2.6svh, 22px)',
                height: 'clamp(14px, 2.6svh, 22px)',
                display: 'grid',
                placeItems: 'center',
                borderRadius: 999,
                cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent'
              }}
            >
              <Box
                sx={{
                  width: 'clamp(6px, 1.2svh, 10px)',
                  height: 'clamp(6px, 1.2svh, 10px)',
                  borderRadius: 999,
                  backgroundColor:
                    i === activeIndex ? theme.palette.primary.main : theme.palette.text.secondary,
                  opacity: i === activeIndex ? 1 : 0.45,
                  transition: 'opacity 120ms ease-out'
                }}
              />
            </Box>
          ))}
      </Box>
    </Box>
  )
}
