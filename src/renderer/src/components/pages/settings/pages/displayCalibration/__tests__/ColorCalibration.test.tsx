import { fireEvent, render, screen } from '@testing-library/react'

const { state } = vi.hoisted(() => ({
  state: { settings: null as Record<string, unknown> | null, saveSettings: vi.fn() }
}))

vi.mock('@store/store', () => ({
  useLiviStore: (selector: (s: unknown) => unknown) => selector(state)
}))

import { ColorCalibration } from '../ColorCalibration'

beforeEach(() => {
  state.settings = null
  state.saveSettings = vi.fn()
})

const props = {} as never

describe('ColorCalibration', () => {
  test('renders three colour sliders driven by the stored gains', () => {
    state.settings = { displayColorR: 0.5, displayColorG: 0.6, displayColorB: 0.7 }
    render(<ColorCalibration {...props} />)
    expect(screen.getByRole('button', { name: 'Red' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Green' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Blue' })).toBeInTheDocument()
  })

  test('committing each channel merges its own patch into the saved settings', () => {
    state.settings = { displayColorR: 0.5, displayColorG: 0.6, displayColorB: 0.7, foo: 'keep' }
    render(<ColorCalibration {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Red' }))
    fireEvent.click(screen.getByRole('button', { name: 'Green' }))
    fireEvent.click(screen.getByRole('button', { name: 'Blue' }))
    expect(state.saveSettings).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ foo: 'keep', displayColorR: 1 })
    )
    expect(state.saveSettings).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ displayColorG: 1 })
    )
    expect(state.saveSettings).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ displayColorB: 1 })
    )
  })

  test('falls back to unit gains when no settings are present', () => {
    render(<ColorCalibration {...props} />)
    expect(screen.getByRole('button', { name: 'Red' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Green' }))
    expect(state.saveSettings).not.toHaveBeenCalled()
  })

  test('committing a slider is a no-op while settings are absent', () => {
    render(<ColorCalibration {...props} />)
    const slider = screen.getAllByRole('slider')[0]
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(state.saveSettings).not.toHaveBeenCalled()
  })
})
