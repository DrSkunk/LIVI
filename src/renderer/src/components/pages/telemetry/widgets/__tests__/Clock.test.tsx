import { render } from '@testing-library/react'
import { Clock } from '../Clock'

const useBlinkingTimeMock = vi.fn()

vi.mock('../../../../../hooks/useBlinkingTime', () => ({
  useBlinkingTime: () => useBlinkingTimeMock()
}))

describe('Clock', () => {
  let originalHeight: number

  beforeEach(() => {
    vi.clearAllMocks()
    originalHeight = window.innerHeight
    useBlinkingTimeMock.mockReturnValue('12:34')
  })

  afterEach(() => {
    window.innerHeight = originalHeight
  })

  test('splits the hour and minute around a visible colon', () => {
    const { container } = render(<Clock />)

    expect(container.textContent).toBe('12:34')
  })

  test('handles the blank-colon blink phase', () => {
    useBlinkingTimeMock.mockReturnValue('12 34')

    const { container } = render(<Clock />)

    expect(container.textContent).toBe('12:34')
  })

  test('accepts an explicit font size', () => {
    const { container } = render(<Clock size={80} />)

    expect(container.textContent).toBe('12:34')
  })

  test('uses the extra-small icon size on short viewports', () => {
    window.innerHeight = 300

    const { container } = render(<Clock />)

    expect(container.textContent).toBe('12:34')
  })

  test('applies className to the root element', () => {
    const { container } = render(<Clock className="clock-test" />)

    expect(container.firstChild).toHaveClass('clock-test')
  })
})
