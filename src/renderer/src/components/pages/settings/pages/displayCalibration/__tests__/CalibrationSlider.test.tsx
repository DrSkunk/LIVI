import { fireEvent, render, screen } from '@testing-library/react'
import { CalibrationSlider } from '../CalibrationSlider'

describe('CalibrationSlider', () => {
  test('reset is disabled at the default and enabled once the draft differs', () => {
    const onCommit = vi.fn()
    const { rerender } = render(
      <CalibrationSlider
        label="gamma"
        value={1}
        min={0}
        max={2}
        defaultValue={1}
        onCommit={onCommit}
      />
    )
    expect(screen.getByRole('button', { name: 'gamma' })).toBeDisabled()

    rerender(
      <CalibrationSlider
        label="gamma"
        value={1.5}
        min={0}
        max={2}
        defaultValue={1}
        onCommit={onCommit}
      />
    )
    expect(screen.getByRole('button', { name: 'gamma' })).toBeEnabled()
  })

  test('reset restores the default and notifies both callbacks', () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    render(
      <CalibrationSlider
        label="contrast"
        value={1.8}
        min={0}
        max={2}
        defaultValue={1}
        onChange={onChange}
        onCommit={onCommit}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'contrast' }))
    expect(onChange).toHaveBeenCalledWith(1)
    expect(onCommit).toHaveBeenCalledWith(1)
  })

  test('dragging updates the draft via onChange and saves on release', () => {
    const onChange = vi.fn()
    const onCommit = vi.fn()
    render(
      <CalibrationSlider
        label="gain"
        value={1}
        min={0}
        max={2}
        step={0.1}
        defaultValue={1}
        onChange={onChange}
        onCommit={onCommit}
      />
    )
    const input = screen.getByRole('slider') as HTMLInputElement
    fireEvent.change(input, { target: { value: '1.4' } })
    expect(onChange).toHaveBeenCalledWith(1.4)
  })

  test('renders an optional swatch colour and icon', () => {
    render(
      <CalibrationSlider
        label="red"
        value={1}
        min={0}
        max={2}
        defaultValue={1}
        swatch="#ff0000"
        icon={<span data-testid="icon">R</span>}
        onCommit={vi.fn()}
      />
    )
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })
})
