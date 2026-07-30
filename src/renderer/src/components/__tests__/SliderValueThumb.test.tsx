import { render } from '@testing-library/react'
import { SliderValueThumb } from '../SliderValueThumb'

function renderThumb(ownerState: Record<string, unknown>, index = 0) {
  return render(
    <SliderValueThumb ownerState={ownerState as never} data-index={index}>
      <input type="range" readOnly />
    </SliderValueThumb>
  )
}

const label = (c: HTMLElement): string | undefined =>
  c.querySelector('.LiviSlider-value')?.textContent ?? undefined

describe('SliderValueThumb — value formatting', () => {
  test('sub-integer steps render two decimals', () => {
    const { container } = renderThumb({ value: 0.5, step: 0.01, valueLabelDisplay: 'on', min: 0 })
    expect(label(container)).toBe('0.50')
  })

  test('whole-number steps round to an integer', () => {
    const { container } = renderThumb({ value: 5.4, step: 1, valueLabelDisplay: 'on', min: 0 })
    expect(label(container)).toBe('5')
  })

  test('a missing step defaults to whole-number rounding', () => {
    const { container } = renderThumb({ value: 5.6, valueLabelDisplay: 'on', min: 0 })
    expect(label(container)).toBe('6')
  })

  test('range values read the entry at the thumb index', () => {
    const { container } = renderThumb({ value: [2, 7], step: 1, valueLabelDisplay: 'on' }, 1)
    expect(label(container)).toBe('7')
  })

  test('a function valueLabelFormat wins', () => {
    const { container } = renderThumb({
      value: 3,
      step: 1,
      valueLabelDisplay: 'on',
      valueLabelFormat: (v: number, i: number) => `#${i}:${v}`
    })
    expect(label(container)).toBe('#0:3')
  })

  test('a string valueLabelFormat wins', () => {
    const { container } = renderThumb({
      value: 3,
      step: 1,
      valueLabelDisplay: 'on',
      valueLabelFormat: 'fixed'
    })
    expect(label(container)).toBe('fixed')
  })

  test('the slider scale is applied before formatting', () => {
    const { container } = renderThumb({
      value: 4,
      step: 1,
      valueLabelDisplay: 'on',
      scale: (v: number) => v * 10
    })
    expect(label(container)).toBe('40')
  })

  test('falls back to defaultValue, then min, then zero', () => {
    const a = renderThumb({ defaultValue: 6, step: 1, valueLabelDisplay: 'on' })
    expect(label(a.container)).toBe('6')
    const b = renderThumb({ min: 2, step: 1, valueLabelDisplay: 'on' })
    expect(label(b.container)).toBe('2')
    const c = renderThumb({ step: 1, valueLabelDisplay: 'on' })
    expect(label(c.container)).toBe('0')
  })

  test('renders no label when the value display is off', () => {
    const { container } = renderThumb({ value: 3, step: 1, valueLabelDisplay: 'off' })
    expect(container.querySelector('.LiviSlider-value')).toBeNull()
  })

  test('data-index defaults to zero when absent', () => {
    const { container } = render(
      <SliderValueThumb ownerState={{ value: [8, 9], step: 1, valueLabelDisplay: 'on' } as never}>
        <span />
      </SliderValueThumb>
    )
    expect(label(container)).toBe('8')
  })
})
