import { fireEvent, render, screen } from '@testing-library/react'

const { state } = vi.hoisted(() => ({
  state: { settings: null as Record<string, unknown> | null, saveSettings: vi.fn() }
}))

vi.mock('@store/store', () => ({
  useLiviStore: (selector: (s: unknown) => unknown) => selector(state)
}))

import { ContrastGammaCalibration } from '../ContrastGammaCalibration'

beforeEach(() => {
  state.settings = null
  state.saveSettings = vi.fn()
})

const props = {} as never

describe('ContrastGammaCalibration', () => {
  test('renders the gamma and contrast sliders', () => {
    state.settings = { displayGamma: 1.2, displayContrast: 0.8 }
    render(<ContrastGammaCalibration {...props} />)
    expect(screen.getByRole('button', { name: 'Gamma' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Contrast' })).toBeInTheDocument()
  })

  test('committing gamma and contrast each merges its own patch', () => {
    state.settings = { displayGamma: 1.5, displayContrast: 0.8, keep: true }
    render(<ContrastGammaCalibration {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Gamma' }))
    fireEvent.click(screen.getByRole('button', { name: 'Contrast' }))
    expect(state.saveSettings).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ keep: true, displayGamma: 1 })
    )
    expect(state.saveSettings).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ displayContrast: 1 })
    )
  })

  test('does not save when settings are absent', () => {
    render(<ContrastGammaCalibration {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Contrast' }))
    expect(state.saveSettings).not.toHaveBeenCalled()
  })
})
