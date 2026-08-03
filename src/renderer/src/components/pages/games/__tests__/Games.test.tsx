import type { GameStatus } from '@shared/types'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Games } from '../Games'

const launch = vi.fn(async () => ({ ok: true as const }))
let statusHandler: ((status: GameStatus) => void) | undefined

beforeEach(() => {
  launch.mockClear()
  statusHandler = undefined
  window.games = {
    getLibrary: vi.fn(async () => [
      { id: 'mario', title: 'Super Mario Bros.', system: 'NES', hasThumbnail: true },
      { id: 'sonic', title: 'Sonic', system: 'Genesis', hasThumbnail: false }
    ]),
    getThumbnail: vi.fn(async () => 'data:image/png;base64,aW1hZ2U='),
    getStatus: vi.fn(async () => ({ state: 'idle' })),
    launch,
    stop: vi.fn(),
    onStatus: vi.fn((handler) => {
      statusHandler = handler
      return vi.fn()
    })
  }
})

describe('Games', () => {
  test('renders horizontal library and launches thumbnail selection', async () => {
    render(<Games />)

    const mario = await screen.findByRole('button', { name: 'Play Super Mario Bros.' })
    expect(screen.getByRole('button', { name: 'Play Sonic' })).toBeInTheDocument()
    expect(screen.getByText('2 games')).toBeInTheDocument()

    fireEvent.click(mario)
    await waitFor(() => expect(launch).toHaveBeenCalledWith('mario'))
  })

  test('shows launch errors and accepts process exit status', async () => {
    launch.mockRejectedValueOnce(new Error('RetroArch not found'))
    render(<Games />)

    fireEvent.click(await screen.findByRole('button', { name: 'Play Sonic' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('RetroArch not found')

    act(() => {
      statusHandler?.({ state: 'idle', gameId: 'sonic', exitCode: 0, signal: null })
    })
  })
})
