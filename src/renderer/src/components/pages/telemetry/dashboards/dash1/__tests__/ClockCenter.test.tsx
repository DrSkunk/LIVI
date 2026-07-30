import { render, screen } from '@testing-library/react'
import { ClockCenter } from '../ClockCenter'

vi.mock('../../../widgets', () => ({
  Clock: () => <div>clock</div>
}))

describe('ClockCenter', () => {
  test('renders the centred clock', () => {
    render(<ClockCenter />)

    expect(screen.getByText('clock')).toBeInTheDocument()
  })
})
