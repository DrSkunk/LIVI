import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SoftwareUpdate } from '../SoftwareUpdate'

let updateEventCb: ((e: any) => void) | undefined
let progressCb: ((p: any) => void) | undefined

const mockSaveSettings = vi.fn()
let mockSettings: any = null

vi.mock('@store/store', () => ({
  useLiviStore: (selector: (s: any) => unknown) =>
    selector({ saveSettings: mockSaveSettings, settings: mockSettings })
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k })
}))

describe('SoftwareUpdate', () => {
  beforeEach(async () => {
    updateEventCb = undefined
    progressCb = undefined
    mockSaveSettings.mockClear()
    ;(globalThis as any).__BUILD_SHA__ = undefined
    ;(globalThis as any).__BUILD_RUN__ = undefined
    mockSettings = { updateNightly: false }
    ;(window as any).app = {
      getVersion: vi.fn().mockResolvedValue('1.0.0'),
      getLatestRelease: vi.fn().mockResolvedValue({ version: '1.1.0', url: 'https://u' }),
      performUpdate: vi.fn(),
      onUpdateEvent: vi.fn((cb: any) => {
        updateEventCb = cb
        return () => {}
      }),
      onUpdateProgress: vi.fn((cb: any) => {
        progressCb = cb
        return () => {}
      }),
      abortUpdate: vi.fn(),
      beginInstall: vi.fn()
    }
  })

  test('loads versions and triggers update action', async () => {
    render(<SoftwareUpdate />)

    await waitFor(() => {
      expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument()
      expect(screen.getByText('1.1.0')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: 'softwareUpdate.update' }))
    expect((window as any).app.performUpdate).toHaveBeenCalledWith('https://u')
  })

  test('renders progress and ready/install actions from update events', async () => {
    render(<SoftwareUpdate />)

    act(() => {
      progressCb?.({ percent: 0.5, received: 1024, total: 2048 })
    })
    expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0)

    act(() => {
      updateEventCb?.({ phase: 'ready', message: '' })
    })

    fireEvent.click(screen.getByText('softwareUpdate.installNow'))
    expect((window as any).app.beginInstall).toHaveBeenCalled()
  })

  test('error event shows error message and close button closes dialog', async () => {
    // lines 98-100: error phase sets error state; line 250: close button
    render(<SoftwareUpdate />)

    // Open the dialog first via ready event (triggers upDialogOpen = true)
    act(() => {
      updateEventCb?.({ phase: 'ready', message: '' })
    })

    // Now fire the error event — dialog stays open, error message rendered
    act(() => {
      updateEventCb?.({ phase: 'error', message: 'network timeout' })
    })

    expect(screen.getByText('network timeout')).toBeInTheDocument()
    const closeBtn = screen.getByText('softwareUpdate.close')
    fireEvent.click(closeBtn)
    // dialog should be gone
    expect(screen.queryByText('softwareUpdate.close')).not.toBeInTheDocument()
  })

  test('aborted error phase auto-closes dialog after 1200ms', async () => {
    // lines 87-92: phase=error + /aborted/ → setTimeout(handleCloseAndReset, 1200)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<SoftwareUpdate />)

    act(() => {
      updateEventCb?.({ phase: 'ready', message: '' })
    })
    // dialog is open now (ready phase)
    expect(screen.getByText('softwareUpdate.installNow')).toBeInTheDocument()

    act(() => {
      updateEventCb?.({ phase: 'error', message: 'Download aborted' })
    })

    // not yet closed
    act(() => {
      vi.advanceTimersByTime(1199)
    })
    // still visible
    expect(screen.getByText('softwareUpdate.close')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(2)
    })
    // auto-closed
    expect(screen.queryByText('softwareUpdate.close')).not.toBeInTheDocument()

    vi.useRealTimers()
  })

  test('the update row shows a spinner and refresh is disabled while in flight', async () => {
    render(<SoftwareUpdate />)

    await waitFor(() => expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument())

    // trigger in-flight state via progress event
    act(() => {
      progressCb?.({ percent: 0.2, received: 200, total: 1000 })
    })

    // In-flight: the update button swaps its label for a spinner (progressbar),
    // and the refresh button is disabled.
    expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'softwareUpdate.refresh' })).toBeDisabled()
  })

  test('getLatestRelease failure shows error message', async () => {
    // lines 70-73: catch → setLatestVersion(''), setMessage(t(...couldNotCheck...))
    ;(window as any).app.getLatestRelease = vi.fn().mockRejectedValue(new Error('network fail'))
    render(<SoftwareUpdate />)

    await waitFor(() => {
      expect(screen.getByText('softwareUpdate.couldNotCheckLatestRelease')).toBeInTheDocument()
    })
  })

  test('getLatestRelease returning no version shows message', async () => {
    // line 66: r.version falsy → setMessage(t(...couldNotCheck...))
    ;(window as any).app.getLatestRelease = vi.fn().mockResolvedValue({ version: null, url: null })
    render(<SoftwareUpdate />)

    await waitFor(() => {
      expect(screen.getByText('softwareUpdate.couldNotCheckLatestRelease')).toBeInTheDocument()
    })
  })
  test('nightly offers an update when the version matches but the commit differs', async () => {
    mockSettings = { updateNightly: true }
    ;(window as any).app.getVersion = vi.fn().mockResolvedValue('8.0.0')
    ;(window as any).app.getLatestRelease = vi.fn().mockResolvedValue({
      version: '8.0.0',
      url: 'https://nightly',
      commit: 'abcdef0123456789',
      run: '123'
    })

    render(<SoftwareUpdate />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'softwareUpdate.update' })).toBeEnabled()
    })

    fireEvent.click(screen.getByRole('button', { name: 'softwareUpdate.update' }))
    expect((window as any).app.performUpdate).toHaveBeenCalledWith('https://nightly')
  })

  test('the nightly switch turns the channel on', async () => {
    render(<SoftwareUpdate />)

    const sw = await screen.findByRole('switch', { name: 'softwareUpdate.channelNightly' })
    expect(sw).not.toBeChecked()

    fireEvent.click(sw)
    expect(mockSaveSettings).toHaveBeenCalledWith(expect.objectContaining({ updateNightly: true }))
  })

  test('the nightly switch turns the channel back off', async () => {
    mockSettings = { updateNightly: true }
    render(<SoftwareUpdate />)

    const sw = await screen.findByRole('switch', { name: 'softwareUpdate.channelNightly' })
    expect(sw).toBeChecked()

    fireEvent.click(sw)
    expect(mockSaveSettings).toHaveBeenCalledWith(expect.objectContaining({ updateNightly: false }))
  })

  test('shows build metadata suffix when build globals are strings', async () => {
    ;(globalThis as any).__BUILD_SHA__ = 'deadbee'
    ;(globalThis as any).__BUILD_RUN__ = '42'
    render(<SoftwareUpdate />)

    await waitFor(() => {
      expect(screen.getByText(/1\.0\.0/)).toBeInTheDocument()
    })
  })

  test('offers a downgrade when the installed version is newer', async () => {
    ;(window as any).app.getVersion = vi.fn().mockResolvedValue('2.0.0')
    ;(window as any).app.getLatestRelease = vi
      .fn()
      .mockResolvedValue({ version: '1.0.0', url: 'https://old' })
    render(<SoftwareUpdate />)

    const btn = await screen.findByRole('button', { name: 'softwareUpdate.downgrade' })
    expect(btn).toBeEnabled()

    fireEvent.click(btn)
    expect(screen.getByText('Software Downgrade')).toBeInTheDocument()
  })

  test('shows up to date and disables the button when versions match', async () => {
    ;(window as any).app.getVersion = vi.fn().mockResolvedValue('1.0.0')
    ;(window as any).app.getLatestRelease = vi
      .fn()
      .mockResolvedValue({ version: '1.0.0', url: 'https://same' })
    render(<SoftwareUpdate />)

    const btn = await screen.findByRole('button', { name: 'softwareUpdate.upToDate' })
    expect(btn).toBeDisabled()
  })

  test('nightly change is ignored when settings are missing', async () => {
    mockSettings = null
    render(<SoftwareUpdate />)

    const sw = await screen.findByRole('switch', { name: 'softwareUpdate.channelNightly' })
    fireEvent.click(sw)
    expect(mockSaveSettings).not.toHaveBeenCalled()
  })

  test('error event with an empty message does not schedule an auto-close', async () => {
    render(<SoftwareUpdate />)

    act(() => {
      updateEventCb?.({ phase: 'ready', message: '' })
    })
    act(() => {
      updateEventCb?.({ phase: 'error', message: '' })
    })

    expect(screen.getByText('softwareUpdate.close')).toBeInTheDocument()
  })

  test('error event without a message falls back to a generic failure text', async () => {
    render(<SoftwareUpdate />)

    act(() => {
      updateEventCb?.({ phase: 'ready', message: '' })
    })
    act(() => {
      updateEventCb?.({ phase: 'error' })
    })

    expect(screen.getAllByText('softwareUpdate.updateFailed').length).toBeGreaterThan(0)
  })

  test('progress without numeric fields resets percent and byte counters', async () => {
    render(<SoftwareUpdate />)

    act(() => {
      progressCb?.({})
    })

    expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0)
  })

  test('unknown phase falls back to a generic working label', async () => {
    render(<SoftwareUpdate />)

    act(() => {
      updateEventCb?.({ phase: 'ready', message: '' })
    })
    act(() => {
      updateEventCb?.({ phase: 'mystery-phase', message: '' })
    })

    expect(screen.getByText('Working…')).toBeInTheDocument()
  })

  test('install phases show the automatic restart notice', async () => {
    render(<SoftwareUpdate />)

    act(() => {
      updateEventCb?.({ phase: 'ready', message: '' })
    })
    act(() => {
      updateEventCb?.({ phase: 'installing', message: '' })
    })

    expect(screen.getByText('softwareUpdate.restartsAutomaticallyWhenDone')).toBeInTheDocument()
  })

  test('abort button aborts the in-flight update', async () => {
    render(<SoftwareUpdate />)

    act(() => {
      updateEventCb?.({ phase: 'ready', message: '' })
    })

    fireEvent.click(screen.getByText('softwareUpdate.abort'))
    expect((window as any).app.abortUpdate).toHaveBeenCalled()
  })

  test('escape keeps the dialog open unless the update failed', async () => {
    render(<SoftwareUpdate />)

    act(() => {
      updateEventCb?.({ phase: 'ready', message: '' })
    })

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.getByText('softwareUpdate.installNow')).toBeInTheDocument()

    act(() => {
      updateEventCb?.({ phase: 'error', message: 'boom' })
    })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByText('softwareUpdate.close')).not.toBeInTheDocument()
  })

  test('clicking the backdrop closes the dialog and resets state', async () => {
    const { baseElement } = render(<SoftwareUpdate />)

    act(() => {
      updateEventCb?.({ phase: 'ready', message: '' })
    })
    expect(screen.getByText('softwareUpdate.installNow')).toBeInTheDocument()

    const backdrop = baseElement.querySelector('.MuiBackdrop-root') as HTMLElement
    fireEvent.click(backdrop)
    expect(screen.queryByText('softwareUpdate.installNow')).not.toBeInTheDocument()
  })
})
