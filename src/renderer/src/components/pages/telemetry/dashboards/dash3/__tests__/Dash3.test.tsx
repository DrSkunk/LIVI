import { render, screen } from '@testing-library/react'
import { Dash3 } from '../Dash3'

vi.mock('../../dash1/DashFrame', () => ({
  DashFrame: ({ clusterFull }: { clusterFull?: boolean }) => (
    <div>DashFrame:{String(clusterFull)}</div>
  )
}))

describe('Dash3', () => {
  test('renders a full-cluster DashFrame', () => {
    render(<Dash3 />)

    expect(screen.getByText('DashFrame:true')).toBeInTheDocument()
  })
})
