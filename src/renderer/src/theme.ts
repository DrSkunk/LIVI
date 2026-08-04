import { THEME, UI } from './constants'
import { themeColors } from './themeColors'
import { createTheme, type Theme } from './ui'

const sliderRoot = ({ ownerState }: { ownerState: { valueLabelDisplay?: string } }) =>
  ownerState.valueLabelDisplay === 'off' ? {} : { color: 'var(--ui-primary)' }

function buildTheme(mode: THEME.LIGHT | THEME.DARK, backgroundOverride?: string): Theme {
  const light = mode === THEME.LIGHT
  const primary = light ? themeColors.primaryColorLight : themeColors.primaryColorDark
  const highlight = light ? themeColors.highlightColorLight : themeColors.highlightColorDark
  const background = backgroundOverride ?? (light ? themeColors.light : themeColors.dark)

  return createTheme({
    palette: {
      mode,
      primary: { main: primary },
      secondary: { main: highlight },
      background: { default: background, paper: light ? '#e7dfd0' : '#100d09' },
      text: {
        primary: light ? themeColors.textPrimaryLight : themeColors.textPrimaryDark,
        secondary: light ? themeColors.textSecondaryLight : themeColors.textSecondaryDark,
        disabled: light ? '#887c68' : '#695f50'
      },
      divider: light ? themeColors.dividerLight : themeColors.dividerDark,
      error: { main: '#d34d3f' },
      success: { main: themeColors.successMain }
    },
    shape: { borderRadius: 3 },
    components: {
      MuiSlider: { styleOverrides: { root: sliderRoot } }
    },
    applyStyles: (wanted, styles) => (wanted === mode ? styles : {})
  })
}

export const lightTheme = buildTheme(THEME.LIGHT)
export const darkTheme = buildTheme(THEME.DARK)

export function buildRuntimeTheme(
  mode: THEME.LIGHT | THEME.DARK,
  primary?: string,
  highlight?: string,
  background?: string
): Theme {
  const base = buildTheme(mode, background)
  return createTheme({
    ...base,
    palette: {
      ...base.palette,
      primary: { main: primary ?? base.palette.primary.main },
      secondary: { main: highlight ?? base.palette.secondary.main }
    }
  })
}

export function initCursorHider() {
  const inactivityMs = UI.INACTIVITY_HIDE_DELAY_MS
  let timer: ReturnType<typeof setTimeout>
  let lastX: number | null = null
  let lastY: number | null = null
  const setCursor = (value: string) => {
    const elems = [
      document.body,
      document.getElementById('main'),
      ...Array.from(
        document.querySelectorAll<HTMLElement>(
          '.MuiTabs-root, .MuiTab-root, .MuiButtonBase-root, .MuiSvgIcon-root'
        )
      )
    ].filter((el): el is HTMLElement => el !== null)
    elems.forEach((el) => el.style.setProperty('cursor', value, 'important'))
  }
  function reset() {
    clearTimeout(timer)
    setCursor('default')
    timer = setTimeout(() => setCursor('none'), inactivityMs)
  }
  document.addEventListener('pointermove', (event) => {
    window.app?.notifyUserActivity?.()
    if (event.pointerType !== 'mouse') return
    const moved = lastX !== null && (event.clientX !== lastX || event.clientY !== lastY)
    lastX = event.clientX
    lastY = event.clientY
    if (moved) reset()
  })
  setCursor('none')
}

let started = false
export function initUiBreatheClock() {
  if (started) return
  started = true
  const root = document.documentElement
  const duration = 1600
  const minimum = 0.18
  const range = 1 - minimum
  const start = performance.now()

  function tick() {
    const progress = ((performance.now() - start) % duration) / duration
    let wave = 0
    if (progress < 0.35) wave = progress / 0.35
    else if (progress < 0.5) wave = 1
    else if (progress < 0.85) wave = 1 - (progress - 0.5) / 0.35
    root.style.setProperty('--ui-breathe-opacity', (minimum + range * wave).toFixed(3))
    setTimeout(tick, 42)
  }
  tick()
}
