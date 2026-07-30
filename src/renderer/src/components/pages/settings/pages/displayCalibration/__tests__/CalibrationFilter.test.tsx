import { render } from '@testing-library/react'
import { CalibrationFilter } from '../CalibrationFilter'

describe('CalibrationFilter', () => {
  test('derives the gamma exponent and contrast intercept from the props', () => {
    const { container } = render(
      <CalibrationFilter id="cal-1" gamma={2} contrast={0.5} gainR={0.9} gainG={1} gainB={1.1} />
    )

    const filter = container.querySelector('filter')
    expect(filter).toHaveAttribute('id', 'cal-1')

    const gammaFuncs = container.querySelectorAll('feFuncR[type="gamma"]')
    expect(gammaFuncs).toHaveLength(1)
    expect(gammaFuncs[0]).toHaveAttribute('exponent', '0.5')

    const linearR = container.querySelectorAll('feFuncR[type="linear"]')
    expect(linearR[0]).toHaveAttribute('slope', '0.5')
    expect(linearR[0]).toHaveAttribute('intercept', '0.25')
    expect(linearR[1]).toHaveAttribute('slope', '0.9')
    const linearB = container.querySelectorAll('feFuncB[type="linear"]')
    expect(linearB[linearB.length - 1]).toHaveAttribute('slope', '1.1')
  })

  test('a unit gamma yields exponent 1 and a full-contrast intercept of 0', () => {
    const { container } = render(
      <CalibrationFilter id="cal-2" gamma={1} contrast={1} gainR={1} gainG={1} gainB={1} />
    )
    expect(container.querySelector('feFuncR[type="gamma"]')).toHaveAttribute('exponent', '1')
    expect(container.querySelector('feFuncR[type="linear"]')).toHaveAttribute('intercept', '0')
  })
})
