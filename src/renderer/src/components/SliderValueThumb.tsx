import { type SliderOwnerState, SliderThumb } from '@mui/material/Slider'
import {
  type ForwardRefExoticComponent,
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  type RefAttributes,
  useLayoutEffect,
  useRef,
  useState
} from 'react'

type Props = {
  ownerState: SliderOwnerState
  children?: ReactNode
  'data-index'?: number
}

const Thumb = SliderThumb as unknown as ForwardRefExoticComponent<
  HTMLAttributes<HTMLSpanElement> & Props & RefAttributes<HTMLSpanElement>
>

const valueAt = (ownerState: SliderOwnerState, index: number): number => {
  const raw = ownerState.value ?? ownerState.defaultValue ?? ownerState.min ?? 0
  const scale = ownerState.scale ?? ((v: number) => v)
  return scale(Number(Array.isArray(raw) ? raw[index] : raw))
}

const format = (ownerState: SliderOwnerState, value: number, index: number): ReactNode => {
  const fmt = ownerState.valueLabelFormat
  if (typeof fmt === 'function') return fmt(value, index)
  if (typeof fmt === 'string') return fmt
  return (ownerState.step ?? 1) < 1 ? value.toFixed(2) : String(Math.round(value))
}

const EDGE_GAP_PX = 8

export const SliderValueThumb = forwardRef<HTMLSpanElement, Props>(function SliderValueThumb(
  { ownerState, children, ...rest },
  ref
) {
  const valueRef = useRef<HTMLSpanElement>(null)
  const [shift, setShift] = useState(0)

  // Keep the value inside the track: push it right once the fill is too short to hold it.
  useLayoutEffect(() => {
    const el = valueRef.current
    const thumb = el?.parentElement
    if (!el || !thumb) return
    const next = Math.max(0, el.offsetWidth + EDGE_GAP_PX - thumb.offsetLeft)
    setShift((prev) => (Math.abs(prev - next) < 0.5 ? prev : next))
  })

  const index = rest['data-index'] ?? 0

  return (
    <Thumb {...rest} ownerState={ownerState} ref={ref}>
      {ownerState.valueLabelDisplay !== 'off' && (
        <span
          className="LiviSlider-value"
          ref={valueRef}
          data-inside={shift === 0 ? 'true' : 'false'}
          style={{ transform: `translate(${shift}px, -50%)` }}
        >
          {format(ownerState, valueAt(ownerState, index), index)}
        </span>
      )}
      {children}
    </Thumb>
  )
})
