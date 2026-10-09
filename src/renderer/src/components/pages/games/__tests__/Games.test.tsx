import type { GameStatus } from '@shared/types'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Games } from '../Games'

const launch = vi.fn(async () => ({ ok: true as const }))
const openRetroArch = vi.fn(async () => ({ ok: true as const }))
const importRoms = vi.fn(async () => ({
  games: 2,
  playlists: 2,
  thumbnailsDownloaded: 1,
  thumbnailsMissing: 1,
  missingCores: []
}))
let statusHandler: ((status: GameStatus) => void) | undefined

beforeEach(() => {
  launch.mockClear()
  openRetroArch.mockClear()
  importRoms.mockClear()
  statusHandler = undefined
  window.games = {
    getLibrary: vi.fn(async () => [
      { id: 'mario', title: 'Super Mario Bros.', system: 'NES', hasThumbnail: true },
      { id: 'sonic', title: 'Sonic', system: 'Genesis', hasThumbnail: false }
    ]),
    importRoms,
    getThumbnail: vi.fn(async () => 'data:image/png;base64,aW1hZ2U='),
    getStatus: vi.fn(async () => ({ state: 'idle' })),
    openRetroArch,
    launch,
    listControllers: vi.fn(async () => []),
    scanControllers: vi.fn(async () => []),
    pairController: vi.fn(async () => ({ ok: true as const })),
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
    expect(screen.getByText('NES')).toBeInTheDocument()
    await waitFor(() => expect(mario.querySelector('img')).toHaveStyle({ objectFit: 'contain' }))

    fireEvent.click(mario)
    await waitFor(() => expect(launch).toHaveBeenCalledWith('mario'))
    expect(mario).toBeDisabled()
    expect(
      screen.getByRole('progressbar', { name: 'Launching Super Mario Bros.' })
    ).toBeInTheDocument()
  })

  test('opens Bluetooth controller pairing from the Games header', async () => {
    render(<Games />)
    fireEvent.click(await screen.findByRole('button', { name: 'Pair controller' }))
    expect(screen.getByRole('dialog', { name: 'Bluetooth controllers' })).toBeInTheDocument()
  })

  test('keeps the manual RetroArch action available for an empty library', async () => {
    vi.mocked(window.games.getLibrary).mockResolvedValueOnce([])
    render(<Games />)

    fireEvent.click(await screen.findByRole('button', { name: 'Open RetroArch', exact: true }))
    await waitFor(() => expect(openRetroArch).toHaveBeenCalledOnce())
    expect(screen.getByRole('button', { name: 'Opening RetroArch…' })).toBeDisabled()
  })

  test('shows setup instructions and imports ROMs when library is empty', async () => {
    vi.mocked(window.games.getLibrary).mockResolvedValueOnce([])
    render(<Games />)

    expect(await screen.findByText('No games yet')).toBeInTheDocument()
    expect(screen.getByText('~/Games/roms')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Import ROMs' }).at(-1)!)
    await waitFor(() => expect(importRoms).toHaveBeenCalledOnce())
    expect(await screen.findByText(/Imported 2 games into 2 playlists/)).toBeInTheDocument()
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
