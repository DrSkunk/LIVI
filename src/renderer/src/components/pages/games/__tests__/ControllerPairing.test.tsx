import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { GamesApi } from '../../../../../../types/PreloadApi'
import { ControllerPairing } from '../ControllerPairing'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

test('ignores a stale controller list after a newer scan completes', async () => {
  const initial = deferred<Awaited<ReturnType<GamesApi['listControllers']>>>()
  const scanned = [
    {
      mac: 'AA:BB:CC:DD:EE:FF',
      name: 'New controller',
      paired: false,
      connected: false
    }
  ]
  window.games = {
    getLibrary: vi.fn(),
    importRoms: vi.fn(),
    getThumbnail: vi.fn(),
    getStatus: vi.fn(),
    openRetroArch: vi.fn(),
    launch: vi.fn(),
    listControllers: vi.fn(() => initial.promise),
    scanControllers: vi.fn(async () => scanned),
    pairController: vi.fn(),
    stop: vi.fn(),
    onStatus: vi.fn()
  } as GamesApi

  render(<ControllerPairing />)
  fireEvent.click(screen.getByRole('button', { name: 'Pair controller' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Scan' }))
  expect(await screen.findByText('New controller')).toBeInTheDocument()

  await act(async () => initial.resolve([]))
  await waitFor(() => expect(screen.getByText('New controller')).toBeInTheDocument())
})
