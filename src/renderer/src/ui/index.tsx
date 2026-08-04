// biome-ignore-all lint/suspicious/noExplicitAny: UI compatibility boundary accepts heterogeneous intrinsic and component props.
import {
  Children,
  type CSSProperties,
  cloneElement,
  createContext,
  type ElementType,
  forwardRef,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useInsertionEffect,
  useMemo
} from 'react'

export type CSSObject = Record<string, unknown>
export type SxProps<T = Theme> = CSSObject | ((theme: T) => CSSObject) | Array<CSSObject | false>
export type SliderOwnerState = {
  size?: string
  valueLabelDisplay?: string
  value?: number | number[]
  defaultValue?: number | number[]
  min?: number
  step?: number
  scale?: (value: number) => number
  valueLabelFormat?: string | ((value: number, index: number) => ReactNode)
}

export type Theme = {
  palette: {
    mode: 'light' | 'dark'
    primary: { main: string }
    secondary: { main: string }
    background: { default: string; paper: string }
    text: { primary: string; secondary: string; disabled: string }
    divider: string
    error: { main: string }
    success: { main: string }
  }
  shape: { borderRadius: number }
  components?: Record<string, any>
  applyStyles: (mode: string, styles: CSSObject) => CSSObject
}

const fallbackTheme: Theme = {
  palette: {
    mode: 'dark',
    primary: { main: '#f59e0b' },
    secondary: { main: '#ffb23e' },
    background: { default: '#080706', paper: '#100e0b' },
    text: { primary: '#f5e6c8', secondary: '#b8a98e', disabled: '#695f50' },
    divider: '#504431',
    error: { main: '#ef4444' },
    success: { main: '#72a46a' }
  },
  shape: { borderRadius: 3 },
  applyStyles: (mode, styles) => (mode === 'dark' ? styles : {})
}

const ThemeContext = createContext<Theme>(fallbackTheme)
export const useTheme = () => useContext(ThemeContext)
export const createTheme = (theme: Partial<Theme>): Theme =>
  ({ ...fallbackTheme, ...theme }) as Theme

export function alpha(color: string, opacity: number): string {
  if (/^#[\da-f]{6}$/i.test(color)) {
    const n = Number.parseInt(color.slice(1), 16)
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${opacity})`
  }
  return `color-mix(in srgb, ${color} ${opacity * 100}%, transparent)`
}

export function ThemeProvider({ theme, children }: { theme: Theme; children: ReactNode }) {
  const p = theme.palette
  useEffect(() => {
    document.documentElement.dataset.theme = p.mode
    document.documentElement.style.colorScheme = p.mode
  }, [p.mode])
  return (
    <ThemeContext.Provider value={theme}>
      <div
        className="livi-theme contents"
        data-theme={p.mode}
        style={
          {
            '--ui-primary': p.primary.main,
            '--ui-highlight': p.secondary.main,
            '--ui-bg': p.background.default,
            '--ui-panel': p.background.paper,
            '--ui-text': p.text.primary,
            '--ui-muted': p.text.secondary,
            '--ui-divider': p.divider
          } as CSSProperties
        }
      >
        {children}
      </div>
    </ThemeContext.Provider>
  )
}

export function CssBaseline(_props: { enableColorScheme?: boolean }) {
  return null
}

const spacingKeys = new Set([
  'm',
  'mt',
  'mr',
  'mb',
  'ml',
  'mx',
  'my',
  'p',
  'pt',
  'pr',
  'pb',
  'pl',
  'px',
  'py',
  'gap',
  'rowGap',
  'columnGap'
])
const pixelKeys = new Set([
  'top',
  'right',
  'bottom',
  'left',
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'fontSize',
  'borderWidth'
])
const aliases: Record<string, string[]> = {
  m: ['margin'],
  mt: ['marginTop'],
  mr: ['marginRight'],
  mb: ['marginBottom'],
  ml: ['marginLeft'],
  mx: ['marginLeft', 'marginRight'],
  my: ['marginTop', 'marginBottom'],
  p: ['padding'],
  pt: ['paddingTop'],
  pr: ['paddingRight'],
  pb: ['paddingBottom'],
  pl: ['paddingLeft'],
  px: ['paddingLeft', 'paddingRight'],
  py: ['paddingTop', 'paddingBottom'],
  bgcolor: ['backgroundColor']
}
const breakpoints: Record<string, number> = { xs: 0, sm: 760, md: 900, lg: 1200, xl: 1536 }
const insertedStyles = new Set<string>()

function sourceOf(sx: any, theme: Theme): Record<string, any> {
  if (!sx) return {}
  if (Array.isArray(sx))
    return Object.assign({}, ...sx.filter(Boolean).map((item) => sourceOf(item, theme)))
  const source = typeof sx === 'function' ? sx(theme) : sx
  return source && typeof source === 'object' ? source : {}
}

function themeValue(value: any, theme: Theme): any {
  if (typeof value !== 'string') return value
  const tokens: Record<string, string> = {
    'primary.main': theme.palette.primary.main,
    'secondary.main': theme.palette.secondary.main,
    'background.default': theme.palette.background.default,
    'background.paper': theme.palette.background.paper,
    'text.primary': theme.palette.text.primary,
    'text.secondary': theme.palette.text.secondary,
    'text.disabled': theme.palette.text.disabled,
    divider: theme.palette.divider,
    error: theme.palette.error.main,
    'error.main': theme.palette.error.main,
    'success.main': theme.palette.success.main
  }
  return tokens[value] ?? value
}

function cssValue(key: string, value: any, theme: Theme): string {
  const resolved = themeValue(typeof value === 'function' ? value(theme) : value, theme)
  if (typeof resolved !== 'number' || resolved === 0) return String(resolved)
  if (spacingKeys.has(key)) return `${resolved * 8}px`
  if (key === 'borderRadius') return `${resolved * theme.shape.borderRadius}px`
  if (pixelKeys.has(key)) return `${resolved}px`
  return String(resolved)
}

const kebab = (key: string) =>
  key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`).replace(/^ms-/, '-ms-')

function emitStyles(source: Record<string, any>, selector: string, theme: Theme): string {
  const declarations: string[] = []
  const nested: string[] = []
  for (const [rawKey, rawValue] of Object.entries(source)) {
    const value = typeof rawValue === 'function' ? rawValue(theme) : rawValue
    if (value == null || value === false) continue
    if (rawKey.startsWith('@keyframes') && typeof value === 'object') {
      const frames = Object.entries(value)
        .map(([step, frame]) => `${step}{${declarationsFor(frame as Record<string, any>, theme)}}`)
        .join('')
      nested.push(`${rawKey}{${frames}}`)
      continue
    }
    if (rawKey.startsWith('@media') && typeof value === 'object') {
      nested.push(`${rawKey}{${emitStyles(value as Record<string, any>, selector, theme)}}`)
      continue
    }
    if (value && typeof value === 'object') {
      const responsive = Object.keys(value).every((key) => key in breakpoints)
      if (responsive) {
        for (const [point, responsiveValue] of Object.entries(value)) {
          const declaration = declarationFor(rawKey, responsiveValue, theme)
          nested.push(
            point === 'xs'
              ? `${selector}{${declaration}}`
              : `@media (min-width:${breakpoints[point]}px){${selector}{${declaration}}}`
          )
        }
      } else {
        const childSelector = rawKey.includes('&')
          ? rawKey.replaceAll('&', selector)
          : rawKey.startsWith(':')
            ? `${selector}${rawKey}`
            : `${selector} ${rawKey}`
        nested.push(emitStyles(value as Record<string, any>, childSelector, theme))
      }
      continue
    }
    declarations.push(declarationFor(rawKey, value, theme))
  }
  return `${declarations.length ? `${selector}{${declarations.join('')}}` : ''}${nested.join('')}`
}

function declarationFor(key: string, value: any, theme: Theme): string {
  return (aliases[key] ?? [key])
    .map((target) => `${kebab(target)}:${cssValue(key, value, theme)};`)
    .join('')
}

function declarationsFor(source: Record<string, any>, theme: Theme): string {
  return Object.entries(source)
    .filter(([, value]) => value != null && typeof value !== 'object')
    .map(([key, value]) => declarationFor(key, value, theme))
    .join('')
}

function sxStyle(sx: any, theme: Theme): CSSProperties {
  const source = sourceOf(sx, theme)
  const result: Record<string, any> = {}
  for (const [key, raw] of Object.entries(source)) {
    const value = typeof raw === 'function' ? raw(theme) : raw
    if (value != null && typeof value === 'object') continue
    for (const target of aliases[key] ?? [key]) result[target] = cssValue(key, value, theme)
  }
  return result as CSSProperties
}

function hash(input: string): string {
  let value = 2166136261
  for (let index = 0; index < input.length; index++)
    value = Math.imul(value ^ input.charCodeAt(index), 16777619)
  return (value >>> 0).toString(36)
}

function useStyleClass(sx: any, theme: Theme): string {
  const source = sourceOf(sx, theme)
  const signature = JSON.stringify([source, theme.palette, theme.shape])
  const className = useMemo(() => `livi-sx-${hash(signature)}`, [signature])
  const css = useMemo(
    () => emitStyles(source, `.${className}`, theme),
    [className, signature, theme]
  )
  useInsertionEffect(() => {
    if (!css || insertedStyles.has(className) || typeof document === 'undefined') return
    const element = document.createElement('style')
    element.dataset.liviStyle = className
    element.textContent = css
    document.head.appendChild(element)
    insertedStyles.add(className)
  }, [className, css])
  return css ? className : ''
}

const omit = new Set([
  'sx',
  'component',
  'variant',
  'color',
  'fullWidth',
  'maxWidth',
  'disableRipple',
  'disableFocusRipple',
  'disableTouchRipple',
  'textColor',
  'visibleScrollbar',
  'selectionFollowsFocus',
  'valueLabelDisplay',
  'valueLabelFormat',
  'marks',
  'track',
  'slots',
  'slotProps',
  'InputProps',
  'InputLabelProps',
  'FormHelperTextProps',
  'labelId',
  'helperText',
  'error',
  'orientation',
  'spacing',
  'divider'
])
function domProps(props: any, extra: string[] = []) {
  const out: any = {}
  const blocked = new Set([...omit, ...extra])
  for (const [key, value] of Object.entries(props)) {
    if (
      !blocked.has(key) &&
      key !== 'children' &&
      key !== 'style' &&
      key !== 'className' &&
      key !== 'ref'
    )
      out[key] = value
  }
  return out
}
function mergeStyle(props: any, theme: Theme, base: CSSProperties = {}) {
  return { ...base, ...sxStyle(props.sx, theme), ...props.style }
}

function primitive(tag: ElementType, baseClass: string, baseStyle: CSSProperties = {}) {
  return forwardRef<any, any>((props, ref) => {
    const theme = useTheme()
    const Tag = props.component ?? tag
    const sxClass = useStyleClass(props.sx, theme)
    return (
      <Tag
        ref={ref}
        {...domProps(props)}
        className={`${baseClass} ${sxClass} ${props.className ?? ''}`.trim()}
        style={mergeStyle(props, theme, baseStyle)}
      >
        {props.children}
      </Tag>
    )
  })
}

export const Box = primitive('div', 'MuiBox-root')
export const Paper = primitive('div', 'MuiPaper-root')
export const FormControl = primitive('div', 'MuiFormControl-root', {
  display: 'flex',
  flexDirection: 'column'
})
export const FormLabel = primitive('label', 'MuiFormLabel-root')
export const Divider = primitive('hr', 'MuiDivider-root chrome-rule')
export const DialogContent = primitive('div', 'MuiDialogContent-root')
export const DialogActions = primitive('div', 'MuiDialogActions-root', {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: 8
})
export const List = primitive('ul', 'MuiList-root')
export const ListItemIcon = primitive('span', 'MuiListItemIcon-root')
export const ListItemText = forwardRef<any, any>(
  ({ primary, secondary, children, ...props }, ref) => (
    <span
      ref={ref}
      {...domProps(props)}
      className={`MuiListItemText-root ${props.className ?? ''}`}
    >
      <span className="block">{primary ?? children}</span>
      {secondary != null && <span className="block text-[var(--ui-muted)]">{secondary}</span>}
    </span>
  )
)

export const Stack = forwardRef<any, any>((props, ref) => {
  const theme = useTheme()
  const direction = props.direction ?? 'column'
  const sxClass = useStyleClass(props.sx, theme)
  return (
    <div
      ref={ref}
      {...domProps(props)}
      className={`MuiStack-root ${sxClass} ${props.className ?? ''}`}
      style={mergeStyle(props, theme, {
        display: 'flex',
        flexDirection: direction,
        gap: typeof props.spacing === 'number' ? props.spacing * 8 : props.spacing
      })}
    >
      {props.children}
    </div>
  )
})

export const Typography = forwardRef<any, any>((props, ref) => {
  const theme = useTheme()
  const Tag =
    props.component ??
    (props.variant?.startsWith('h')
      ? props.variant
      : props.variant === 'caption' || props.variant === 'overline'
        ? 'span'
        : 'p')
  const sxClass = useStyleClass(props.sx, theme)
  return (
    <Tag
      ref={ref}
      {...domProps(props, ['noWrap'])}
      className={`MuiTypography-root MuiTypography-${props.variant ?? 'body1'} ${sxClass} ${props.className ?? ''}`}
      style={mergeStyle(props, theme, {
        color: themeValue(props.color, theme),
        ...(props.noWrap
          ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
          : {})
      })}
    >
      {props.children}
    </Tag>
  )
})

export const Button = forwardRef<any, any>((props, ref) => {
  const theme = useTheme()
  const sxClass = useStyleClass(props.sx, theme)
  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      {...domProps(props, ['startIcon', 'endIcon'])}
      className={`MuiButtonBase-root MuiButton-root command-button ${props.variant === 'contained' ? 'is-contained' : ''} ${props.variant === 'text' ? 'is-text' : ''} ${sxClass} ${props.className ?? ''}`}
      style={mergeStyle(props, theme)}
    >
      <span className="command-button-icon">{props.startIcon}</span>
      <span>{props.children}</span>
      <span className="command-button-icon">{props.endIcon}</span>
    </button>
  )
})
export const IconButton = forwardRef<any, any>((props, ref) => {
  const theme = useTheme()
  const sxClass = useStyleClass(props.sx, theme)
  return (
    <button
      ref={ref}
      type="button"
      {...domProps(props, ['size'])}
      className={`MuiButtonBase-root MuiIconButton-root command-icon-button ${sxClass} ${props.className ?? ''}`}
      style={mergeStyle(props, theme)}
    >
      {props.children}
    </button>
  )
})

export const Alert = forwardRef<any, any>((props, ref) => {
  const theme = useTheme()
  const sxClass = useStyleClass(props.sx, theme)
  return (
    <div
      ref={ref}
      role="alert"
      {...domProps(props, ['severity'])}
      className={`MuiAlert-root command-alert ${sxClass} ${props.className ?? ''}`}
      style={mergeStyle(props, theme)}
    >
      {props.children}
    </div>
  )
})
export const Chip = forwardRef<any, any>((props, ref) => {
  const theme = useTheme()
  const sxClass = useStyleClass(props.sx, theme)
  return (
    <span
      ref={ref}
      {...domProps(props, ['label', 'size'])}
      className={`MuiChip-root command-chip ${sxClass} ${props.className ?? ''}`}
      style={mergeStyle(props, theme)}
    >
      {props.label ?? props.children}
    </span>
  )
})
export const CircularProgress = forwardRef<any, any>((props, ref) => {
  const theme = useTheme()
  const sxClass = useStyleClass(props.sx, theme)
  return (
    <span
      ref={ref}
      role="progressbar"
      {...domProps(props, ['size', 'thickness'])}
      className={`MuiCircularProgress-root command-spinner ${sxClass} ${props.className ?? ''}`}
      style={mergeStyle(props, theme, {
        width: props.size,
        height: props.size,
        color: themeValue(props.color, theme)
      })}
    />
  )
})
export const LinearProgress = forwardRef<any, any>((props, ref) => {
  const theme = useTheme()
  const sxClass = useStyleClass(props.sx, theme)
  return (
    <div
      ref={ref}
      role="progressbar"
      {...domProps(props, ['value'])}
      className={`MuiLinearProgress-root command-progress ${sxClass} ${props.className ?? ''}`}
      style={mergeStyle(props, theme)}
    >
      <i style={{ width: `${props.value ?? 40}%` }} />
    </div>
  )
})

export const TextField = forwardRef<any, any>((props, ref) => {
  const theme = useTheme()
  const sxClass = useStyleClass(props.sx, theme)
  const controlProps = domProps(props, ['label', 'select'])
  const control = props.select ? (
    <select ref={ref} {...controlProps}>
      {props.children}
    </select>
  ) : (
    <input ref={ref} {...controlProps} />
  )
  return (
    <label
      className={`MuiTextField-root command-field ${sxClass} ${props.className ?? ''}`}
      style={mergeStyle(props, theme)}
    >
      {props.label && <span>{props.label}</span>}
      {control}
      {props.helperText && <small>{props.helperText}</small>}
    </label>
  )
})
export const OutlinedInput = forwardRef<any, any>((props, ref) => {
  const theme = useTheme()
  const sxClass = useStyleClass(props.sx, theme)
  return (
    <input
      ref={props.inputRef ?? ref}
      {...domProps(props, ['inputRef'])}
      {...props.slotProps?.input}
      className={`MuiOutlinedInput-input command-input ${sxClass} ${props.className ?? ''}`}
      style={mergeStyle(props, theme)}
    />
  )
})
export const MenuItem = forwardRef<any, any>((props, ref) => (
  <option ref={ref} {...domProps(props)} value={props.value}>
    {props.children}
  </option>
))
export const Select = forwardRef<any, any>((props, ref) => {
  const theme = useTheme()
  const sxClass = useStyleClass(props.sx, theme)
  const onChange = props.onChange
  return (
    <select
      ref={ref}
      {...domProps(props)}
      className={`MuiSelect-root command-input ${sxClass} ${props.className ?? ''}`}
      style={mergeStyle(props, theme)}
      onChange={(e) => onChange?.(e, e.target.value)}
    >
      {props.children}
    </select>
  )
})
export const Switch = forwardRef<any, any>((props, ref) => {
  const theme = useTheme()
  const sxClass = useStyleClass(props.sx, theme)
  const { onChange, inputProps, ...rest } = props
  return (
    <label
      className={`MuiSwitch-root command-switch ${sxClass} ${props.className ?? ''}`}
      style={mergeStyle(props, theme)}
    >
      <input
        ref={ref}
        type="checkbox"
        {...domProps(rest)}
        {...inputProps}
        onChange={(event) => onChange?.(event, event.target.checked)}
      />
      <span />
    </label>
  )
})

export const SliderThumb = primitive('span', 'MuiSlider-thumb')
export const Slider = forwardRef<any, any>((props, ref) => {
  const theme = useTheme()
  const value = Array.isArray(props.value)
    ? props.value[0]
    : (props.value ?? props.defaultValue ?? props.min ?? 0)
  const min = props.min ?? 0
  const max = props.max ?? 100
  const percent = ((Number(value) - min) / (max - min || 1)) * 100
  const sxClass = useStyleClass(props.sx, theme)
  const commit = (event: any) => props.onChangeCommitted?.(event, Number(event.currentTarget.value))
  return (
    <div
      className={`MuiSlider-root command-slider ${sxClass} ${props.className ?? ''}`}
      style={mergeStyle(props, theme)}
    >
      <input
        ref={ref}
        type="range"
        {...domProps(props, ['size', 'onChangeCommitted'])}
        onChange={(e) => props.onChange?.(e, Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
      />
      {props.valueLabelDisplay !== 'off' && (
        <span className="command-slider-value" style={{ left: `${percent}%` }}>
          {props.valueLabelFormat ? props.valueLabelFormat(value) : value}
        </span>
      )}
    </div>
  )
})

export const Tabs = forwardRef<any, any>((props, ref) => {
  const theme = useTheme()
  const sxClass = useStyleClass(props.sx, theme)
  return (
    <div
      ref={ref}
      role="tablist"
      aria-label={props['aria-label']}
      className={`MuiTabs-root ${props.orientation === 'vertical' ? 'is-vertical' : ''} ${sxClass} ${props.className ?? ''}`}
      style={mergeStyle(props, theme)}
    >
      <div className="MuiTabs-list">
        {Children.map(props.children, (child, i) =>
          isValidElement(child)
            ? cloneElement(child as ReactElement<any>, {
                selected: props.value === i,
                onTabSelect: (e: any) => props.onChange?.(e, i)
              })
            : child
        )}
      </div>
    </div>
  )
})
export const Tab = forwardRef<any, any>((props, ref) => {
  const theme = useTheme()
  const sxClass = useStyleClass(props.sx, theme)
  const click = (e: any) => {
    props.onTabSelect?.(e)
    props.onClick?.(e)
  }
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      aria-selected={props.selected}
      aria-label={props['aria-label'] ?? props.label}
      disabled={props.disabled}
      onClick={click}
      className={`MuiButtonBase-root MuiTab-root ${props.selected ? 'Mui-selected' : ''} ${sxClass} ${props.className ?? ''}`}
      style={mergeStyle(props, theme)}
    >
      <span className="MuiTab-iconWrapper">{props.icon}</span>
      {props.label}
    </button>
  )
})

export function Dialog({ open, children, onClose, ...props }: any) {
  useEffect(() => {
    if (!open || !onClose) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose(event, 'escapeKeyDown')
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [open, onClose])
  if (!open) return null
  const title = Children.toArray(children).find(
    (child) => isValidElement(child) && child.type === DialogTitle
  ) as ReactElement<any> | undefined
  const accessibleName =
    typeof title?.props?.children === 'string' ? title.props.children : undefined
  return (
    <div
      role="presentation"
      className="MuiDialog-root MuiBackdrop-root command-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.(event, 'backdropClick')
      }}
    >
      <div
        role="dialog"
        aria-label={accessibleName}
        {...domProps(props)}
        className="MuiDialog-paper command-modal"
      >
        {children}
      </div>
    </div>
  )
}
export const Modal = Dialog
export function DialogTitle(props: any) {
  return <div className="MuiDialogTitle-root command-modal-title">{props.children}</div>
}

export const ListItem = forwardRef<any, any>((props, ref) => {
  const theme = useTheme()
  const sxClass = useStyleClass(props.sx, theme)
  const Tag = props.component ?? 'li'
  return (
    <Tag
      ref={ref}
      {...domProps(props, ['button', 'secondaryAction'])}
      className={`MuiListItem-root ${props.button ? 'command-list-button' : ''} ${sxClass} ${props.className ?? ''}`}
      style={mergeStyle(props, theme)}
    >
      {props.children}
      {props.secondaryAction}
    </Tag>
  )
})

export function styled(
  Component: any,
  options?: { shouldForwardProp?: (prop: string) => boolean }
) {
  return (styles: any) =>
    forwardRef<any, any>((props, ref) => {
      const theme = useTheme()
      const computed = typeof styles === 'function' ? styles({ ...props, theme }) : styles
      const sxClass = useStyleClass(computed, theme)
      const filtered: any = {}
      for (const [key, value] of Object.entries(props))
        if (!options?.shouldForwardProp || options.shouldForwardProp(key)) filtered[key] = value
      return (
        <Component
          ref={ref}
          {...filtered}
          className={`${sxClass} ${props.className ?? ''}`}
          style={{ ...sxStyle(computed, theme), ...props.style }}
        />
      )
    })
}
