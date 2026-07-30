import { fireEvent, render, screen } from '@testing-library/react'
import { ColorPickerControl } from '../ColorPickerControl'
import { defaultColorForPath } from '../colorUtils'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => `t:${k}` })
}))

let capturedSliders: any[] = []

vi.mock('@mui/material', async () => {
  const actual = await vi.importActual('@mui/material')
  return {
    ...actual,
    Slider: (props: any) => {
      capturedSliders.push(props)
      return (
        <input
          data-testid="slider"
          type="range"
          value={props.value}
          onChange={(e) => {
            const next = Number(e.currentTarget.value)
            props.onChange?.(e, next)
          }}
        />
      )
    },
    IconButton: ({ onClick, disabled, children }: any) => (
      <button data-testid="reset" disabled={disabled} onClick={onClick}>
        {children}
      </button>
    )
  }
})

const colorNode = { type: 'color', label: 'Primary', path: 'primaryColorDark' } as any

describe('ColorPickerControl', () => {
  beforeEach(() => {
    capturedSliders = []
  })

  test('shows the default color when no custom value is set', () => {
    render(<ColorPickerControl node={colorNode} value={null} onChange={vi.fn()} />)

    expect(
      screen.getByText(defaultColorForPath('primaryColorDark').toUpperCase())
    ).toBeInTheDocument()
    expect(screen.getByTestId('reset')).toBeDisabled()
  })

  test('shows an uppercased custom hex and enables reset', () => {
    render(<ColorPickerControl node={colorNode} value="#abcdef" onChange={vi.fn()} />)

    expect(screen.getByText('#ABCDEF')).toBeInTheDocument()
    expect(screen.getByTestId('reset')).not.toBeDisabled()
  })

  test('previews on drag without committing and commits on release', () => {
    const onChange = vi.fn()
    render(<ColorPickerControl node={colorNode} value="#ff0000" onChange={onChange} />)

    const hueSlider = capturedSliders[0]
    hueSlider.onChange({}, 200)
    expect(onChange).not.toHaveBeenCalled()

    hueSlider.onChangeCommitted({}, 200)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toMatch(/^#[0-9a-f]{6}$/)
  })

  test('commits saturation and lightness rows', () => {
    const onChange = vi.fn()
    render(<ColorPickerControl node={colorNode} value="#3366cc" onChange={onChange} />)

    capturedSliders[1].onChangeCommitted({}, 50)
    capturedSliders[2].onChangeCommitted({}, 40)
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  test('reset clears the custom value', () => {
    const onChange = vi.fn()
    render(<ColorPickerControl node={colorNode} value="#112233" onChange={onChange} />)

    fireEvent.click(screen.getByTestId('reset'))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  test('syncs local state when the incoming value changes externally', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <ColorPickerControl node={colorNode} value="#111111" onChange={onChange} />
    )
    expect(screen.getByText('#111111')).toBeInTheDocument()

    rerender(<ColorPickerControl node={colorNode} value="#222222" onChange={onChange} />)
    expect(screen.getByText('#222222')).toBeInTheDocument()
  })

  test('keeps the local draft when the committed value echoes back', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <ColorPickerControl node={colorNode} value="#ff0000" onChange={onChange} />
    )

    capturedSliders[0].onChangeCommitted({}, 120)
    const committed = onChange.mock.calls[0][0] as string

    rerender(<ColorPickerControl node={colorNode} value={committed} onChange={onChange} />)
    expect(screen.getByText(committed.toUpperCase())).toBeInTheDocument()
  })

  test('falls back to the default color for a node without a path', () => {
    const pathlessNode = { type: 'color', label: 'X' } as any
    render(<ColorPickerControl node={pathlessNode} value="   " onChange={vi.fn()} />)

    expect(screen.getByText(defaultColorForPath(undefined).toUpperCase())).toBeInTheDocument()
  })
})
