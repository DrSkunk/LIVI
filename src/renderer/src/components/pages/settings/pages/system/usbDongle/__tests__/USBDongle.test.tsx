import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { USBDongle } from '../USBDongle'

let onEventCb: ((e: unknown, p: unknown) => void) | undefined

function deferred() {
  let resolve: (value?: unknown) => void = () => {}
  let reject: (reason?: unknown) => void = () => {}
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function readyLocal(latestVer: string, path = '/tmp/fw.bin', bytes = 4096) {
  return { ok: true, ready: true, path, bytes, latestVer }
}

async function clickCheck() {
  const btn = await screen.findByText('Check for Updates')
  await waitFor(() => expect(btn.closest('button')).not.toBeDisabled())
  fireEvent.click(btn)
  return btn
}

type DevListItem = {
  index: number
  name: string
  type: string
  id: string
  time: string
  rfcomm: string
}

const state = {
  isDongleHardwarePresent: true,
  settings: { dongleToolsIp: '' },
  saveSettings: vi.fn().mockResolvedValue(undefined),
  vendorId: 0x1234,
  productId: 0xabcd,
  usbFwVersion: '1.0.0',
  dongleFwVersion: '2025.01.01.0001',
  boxInfo: {
    uuid: 'u1',
    MFD: 'mfd',
    productType: 'p1',
    DevList: [] as DevListItem[]
  }
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, vars?: Record<string, unknown>) => {
      if (!vars) return k
      return `${k} ${JSON.stringify(vars)}`
    }
  })
}))

vi.mock('@store/store', () => ({
  useStatusStore: (selector: (s: any) => unknown) =>
    selector({
      isDongleHardwarePresent: state.isDongleHardwarePresent
    }),
  useLiviStore: (selector: (s: any) => unknown) =>
    selector({
      settings: state.settings,
      saveSettings: state.saveSettings,
      vendorId: state.vendorId,
      productId: state.productId,
      usbFwVersion: state.usbFwVersion,
      dongleFwVersion: state.dongleFwVersion,
      boxInfo: state.boxInfo
    })
}))

vi.mock('@renderer/hooks/useNetworkStatus', () => ({
  useNetworkStatus: vi.fn(() => ({ online: true, type: 'wifi', effectiveType: '4g' }))
}))

describe('USBDongle', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    state.isDongleHardwarePresent = true
    state.settings = { dongleToolsIp: '' }
    state.boxInfo = { uuid: 'u1', MFD: 'mfd', productType: 'p1', DevList: [] }
    state.dongleFwVersion = '2025.01.01.0001'
    state.vendorId = 0x1234
    state.productId = 0xabcd
    state.usbFwVersion = '1.0.0'
    state.saveSettings.mockResolvedValue(undefined)
    onEventCb = undefined
    ;(window as any).projection = {
      ipc: {
        dongleFirmware: vi.fn(async (action: string) => ({
          ok: true,
          raw: { err: 0, ver: action === 'check' ? '2025.02.01.0001' : '-' },
          request: { local: { ok: true, ready: false, reason: 'missing' } }
        })),
        onEvent: vi.fn((cb: any) => {
          onEventCb = cb
        }),
        offEvent: vi.fn()
      },
      usb: {
        uploadLiviScripts: vi
          .fn()
          .mockResolvedValue({ ok: true, cgiOk: true, webOk: true, urls: [] })
      }
    }
    ;(window as any).app = {
      openExternal: vi.fn().mockResolvedValue({ ok: true })
    }
  })

  test('renders status sections and runs firmware check action', async () => {
    render(<USBDongle />)

    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Firmware')).toBeInTheDocument()
    expect(screen.getByText('Check for Updates')).toBeInTheDocument()

    await waitFor(() => {
      expect((window as any).projection.ipc.dongleFirmware).toHaveBeenCalledWith('status')
    })

    fireEvent.click(screen.getByText('Check for Updates'))

    await waitFor(() => {
      expect((window as any).projection.ipc.dongleFirmware).toHaveBeenCalledWith('check')
    })
  })

  test('shows fw progress dialog when fwUpdate events are received', async () => {
    render(<USBDongle />)

    act(() => {
      onEventCb?.(null, { type: 'fwUpdate', stage: 'download:start' })
      onEventCb?.(null, {
        type: 'fwUpdate',
        stage: 'download:progress',
        received: 1024,
        total: 2048,
        percent: 0.5
      })
    })

    expect(screen.getByText('Dongle Firmware')).toBeInTheDocument()
    expect(screen.getByText('Downloading')).toBeInTheDocument()
    expect(screen.getByText('50% • 1 KB / 2 KB')).toBeInTheDocument()
  })

  test('shows changelog button enabled and opens vendor changelog dialog', async () => {
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async (action: string) => ({
      ok: true,
      raw: {
        err: 0,
        ver: action === 'check' ? '2025.02.01.0001' : '-',
        notes: 'Bug fixes\nImprovements'
      },
      request: { local: { ok: true, ready: false, reason: 'missing' } }
    }))

    render(<USBDongle />)

    const changelogBtn = await screen.findByText('Changelog')
    expect(changelogBtn).not.toBeDisabled()

    fireEvent.click(changelogBtn)

    expect(screen.getByText('Vendor changelog')).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('Bug fixes'))).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('Improvements'))).toBeInTheDocument()
  })

  test('download button opens ready dialog immediately when firmware is already downloaded', async () => {
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async (action: string) => {
      if (action === 'status' || action === 'download') {
        return {
          ok: true,
          raw: { err: 0, ver: '2025.02.01.0001' },
          request: {
            local: {
              ok: true,
              ready: true,
              path: '/tmp/fw.bin',
              bytes: 4096,
              latestVer: '2025.02.01.0001'
            }
          }
        }
      }

      return {
        ok: true,
        raw: { err: 0, ver: '-' },
        request: { local: { ok: true, ready: false, reason: 'missing' } }
      }
    })

    render(<USBDongle />)

    await waitFor(() => {
      expect((window as any).projection.ipc.dongleFirmware).toHaveBeenCalledWith('status')
    })

    fireEvent.click(screen.getByText('Download'))

    await waitFor(() => {
      expect(screen.getByText('Dongle Firmware')).toBeInTheDocument()
      expect(screen.getByText(/Already downloaded\./)).toBeInTheDocument()
    })
  })

  test('upload button is disabled when local firmware is not ready', async () => {
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async () => ({
      ok: true,
      raw: { err: 0, ver: '2025.02.01.0001' },
      request: {
        local: {
          ok: true,
          ready: false,
          reason: 'missing'
        }
      }
    }))

    render(<USBDongle />)

    const uploadBtn = await screen.findByText('Upload')
    expect(uploadBtn).toBeDisabled()
  })

  test('enables dev tools, saves configured IP and opens matching URL', async () => {
    ;(window as any).projection.usb.uploadLiviScripts = vi.fn().mockResolvedValue({
      ok: true,
      cgiOk: true,
      webOk: true,
      urls: ['http://192.168.1.10/cgi-bin/server.cgi?action=ls&path=/']
    })

    render(<USBDongle />)

    const input = screen.getByLabelText('settings.dongleIpOptional') as HTMLInputElement
    fireEvent.change(input, { target: { value: '192.168.1.10' } })

    fireEvent.click(screen.getByText('settings.enableDevTools'))

    await waitFor(() => {
      expect(state.saveSettings).toHaveBeenCalledWith({ dongleToolsIp: '192.168.1.10' })
    })

    await waitFor(() => {
      expect((window as any).projection.usb.uploadLiviScripts).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect((window as any).app.openExternal).toHaveBeenCalledWith(
        'http://192.168.1.10/index.html'
      )
    })
  })

  test('shows error when dev tools IP is invalid', async () => {
    render(<USBDongle />)

    const input = screen.getByLabelText('settings.dongleIpOptional') as HTMLInputElement
    fireEvent.change(input, { target: { value: '999.999.1.1' } })

    fireEvent.click(screen.getByText('settings.enableDevTools'))

    await waitFor(() => {
      expect(screen.getAllByText(/settings.devToolsInvalidIp/).length).toBeGreaterThan(0)
    })

    expect((window as any).projection.usb.uploadLiviScripts).not.toHaveBeenCalled()
  })

  test('shows partial alert when dev tools upload succeeds only partially', async () => {
    ;(window as any).projection.usb.uploadLiviScripts = vi.fn().mockResolvedValue({
      ok: false,
      cgiOk: true,
      webOk: false,
      urls: []
    })

    render(<USBDongle />)

    fireEvent.click(screen.getByText('settings.enableDevTools'))

    await waitFor(() => {
      expect(screen.getByText(/settings.devToolsPartial/)).toBeInTheDocument()
    })
  })

  test('shows candidate URLs when no URL was opened but upload returned candidates', async () => {
    state.settings = { dongleToolsIp: '' }
    ;(window as any).projection.usb.uploadLiviScripts = vi.fn().mockResolvedValue({
      ok: true,
      cgiOk: true,
      webOk: true,
      urls: ['http://10.0.0.5/cgi-bin/server.cgi?action=ls&path=/', 'http://10.0.0.5/index.html']
    })
    ;(window as any).app.openExternal = vi.fn().mockResolvedValue({ ok: false, error: 'blocked' })

    render(<USBDongle />)

    fireEvent.click(screen.getByText('settings.enableDevTools'))

    await waitFor(() => {
      expect(screen.getByText('settings.tryOneOfUrls')).toBeInTheDocument()
    })

    expect(screen.getByText('http://10.0.0.5/index.html')).toBeInTheDocument()
  })

  test('cleans up dev tools state when dongle disconnects', async () => {
    const { rerender } = render(<USBDongle />)

    fireEvent.click(screen.getByText('settings.enableDevTools'))

    await waitFor(() => {
      expect((window as any).projection.usb.uploadLiviScripts).toHaveBeenCalled()
    })

    state.isDongleHardwarePresent = false
    rerender(<USBDongle />)

    expect(screen.queryByText('settings.devToolsEnabled')).not.toBeInTheDocument()
  })
  test('auto closes firmware dialog after download is ready with saved message', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    render(<USBDongle />)

    act(() => {
      onEventCb?.(null, { type: 'fwUpdate', stage: 'download:start' })
      onEventCb?.(null, {
        type: 'fwUpdate',
        stage: 'download:done',
        path: '/tmp/fw.bin'
      })
    })

    expect(screen.getByText('Dongle Firmware')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
    expect(screen.getByText('Saved to: /tmp/fw.bin')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(900)
    })

    await waitFor(() => {
      expect(screen.queryByText('Dongle Firmware')).not.toBeInTheDocument()
    })

    vi.useRealTimers()
  })

  test('closes firmware dialog after upload finished and dongle disconnects then reconnects', async () => {
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async (action: string) => {
      if (action === 'status') {
        return {
          ok: true,
          raw: { err: 0, ver: '2025.02.01.0001' },
          request: {
            local: {
              ok: true,
              ready: true,
              path: '/tmp/fw.bin',
              bytes: 4096,
              latestVer: '2025.02.01.0002'
            }
          }
        }
      }

      if (action === 'upload') {
        return {
          ok: true,
          raw: { err: 0, ver: '2025.02.01.0002' },
          request: {
            local: {
              ok: true,
              ready: true,
              path: '/tmp/fw.bin',
              bytes: 4096,
              latestVer: '2025.02.01.0002'
            }
          }
        }
      }

      return {
        ok: true,
        raw: { err: 0, ver: '-' },
        request: {
          local: {
            ok: true,
            ready: true,
            path: '/tmp/fw.bin',
            bytes: 4096,
            latestVer: '2025.02.01.0002'
          }
        }
      }
    })

    const { rerender } = render(<USBDongle />)

    await waitFor(() => {
      expect((window as any).projection.ipc.dongleFirmware).toHaveBeenCalledWith('status')
    })

    const uploadBtn = await screen.findByText('Upload')
    expect(uploadBtn).not.toBeDisabled()

    fireEvent.click(uploadBtn)

    await waitFor(() => {
      expect((window as any).projection.ipc.dongleFirmware).toHaveBeenCalledWith('upload')
    })

    act(() => {
      onEventCb?.(null, {
        type: 'fwUpdate',
        stage: 'upload:done',
        message: 'Upload complete'
      })
    })

    expect(screen.getByText('Dongle Firmware')).toBeInTheDocument()
    expect(screen.getByText('Upload complete')).toBeInTheDocument()

    state.isDongleHardwarePresent = false
    rerender(<USBDongle />)

    state.isDongleHardwarePresent = true
    rerender(<USBDongle />)

    await waitFor(() => {
      expect(screen.queryByText('Dongle Firmware')).not.toBeInTheDocument()
    })
  })

  test('does not run status effect while dongle is disconnected', async () => {
    state.isDongleHardwarePresent = false

    render(<USBDongle />)

    await Promise.resolve()
    expect((window as any).projection.ipc.dongleFirmware).not.toHaveBeenCalled()
  })

  test('does not run status effect when dongle firmware version is missing', async () => {
    state.dongleFwVersion = ''

    render(<USBDongle />)

    await Promise.resolve()
    expect((window as any).projection.ipc.dongleFirmware).not.toHaveBeenCalled()
  })

  test('disables check for updates when offline', async () => {
    const net = await import('@renderer/hooks/useNetworkStatus')
    ;(net.useNetworkStatus as any).mockReturnValue({ online: false })

    try {
      render(<USBDongle />)
      expect(screen.getByText('Check for Updates').closest('button')).toBeDisabled()
    } finally {
      ;(net.useNetworkStatus as any).mockReturnValue({
        online: true,
        type: 'wifi',
        effectiveType: '4g'
      })
    }
  })

  test('renders dashes when usb vendor and product ids are missing', async () => {
    state.vendorId = null as any
    state.productId = null as any

    render(<USBDongle />)

    expect(screen.getByLabelText('USB Vendor: —')).toBeInTheDocument()
    expect(screen.getByLabelText('USB Product: —')).toBeInTheDocument()
  })

  test('shows phone connected when box info has a bluetooth mac address', async () => {
    state.boxInfo = {
      uuid: 'u1',
      MFD: 'mfd',
      productType: 'p1',
      btMacAddr: 'AA:BB:CC:DD:EE:FF',
      DevList: []
    } as any

    render(<USBDongle />)

    expect(screen.getByLabelText('Phone: Connected')).toBeInTheDocument()
  })

  test('shows up to date firmware status when there is no update', async () => {
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async () => ({
      ok: true,
      raw: { err: 0, ver: '2025.01.01.0001' },
      request: { local: { ok: true, ready: false, reason: 'missing' } }
    }))

    render(<USBDongle />)

    await waitFor(() => {
      expect(screen.getByLabelText('FW Status: Up to date')).toBeInTheDocument()
    })
  })

  test('shows checking local status text while the status action is in flight', async () => {
    const d = deferred()
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(() => d.promise)

    render(<USBDongle />)

    await waitFor(() => {
      expect(screen.getByLabelText('FW Status: Checking local status…')).toBeInTheDocument()
    })

    await act(async () => {
      d.resolve({
        ok: true,
        raw: { err: 0, ver: '-' },
        request: { local: { ok: true, ready: false, reason: 'missing' } }
      })
    })
  })

  test('shows checking text and spinner while the check action is in flight', async () => {
    const d = deferred()
    ;(window as any).projection.ipc.dongleFirmware = vi.fn((action: string) => {
      if (action === 'check') return d.promise
      return Promise.resolve({
        ok: true,
        raw: { err: 0, ver: '-' },
        request: { local: { ok: true, ready: false, reason: 'missing' } }
      })
    })

    render(<USBDongle />)

    await clickCheck()

    await waitFor(() => {
      expect(screen.getByLabelText('FW Status: Checking…')).toBeInTheDocument()
    })

    await act(async () => {
      d.resolve({ ok: true, raw: { err: 0, ver: '-' }, request: {} })
    })
  })

  test('shows downloading text while the download action is in flight', async () => {
    const dl = deferred()
    ;(window as any).projection.ipc.dongleFirmware = vi.fn((action: string) => {
      if (action === 'download') return dl.promise
      return Promise.resolve({
        ok: true,
        raw: { err: 0, ver: '2025.02.01.0001' },
        request: { local: { ok: true, ready: false, reason: 'missing' } }
      })
    })

    render(<USBDongle />)

    await clickCheck()

    await waitFor(() => {
      expect(screen.getByLabelText('FW Status: Update available')).toBeInTheDocument()
    })

    const downloadBtn = screen.getByText('Download')
    await waitFor(() => expect(downloadBtn.closest('button')).not.toBeDisabled())

    fireEvent.click(downloadBtn)

    await waitFor(() => {
      expect(screen.getByLabelText('FW Status: Downloading…')).toBeInTheDocument()
    })

    await act(async () => {
      dl.resolve({
        ok: true,
        raw: { err: 0, ver: '2025.02.01.0001' },
        request: { local: { ok: true, ready: false, reason: 'missing' } }
      })
    })
  })

  test('shows uploading text while the upload action is in flight', async () => {
    const up = deferred()
    const ready = readyLocal('2025.02.01.0002')
    ;(window as any).projection.ipc.dongleFirmware = vi.fn((action: string) => {
      if (action === 'upload') return up.promise
      return Promise.resolve({
        ok: true,
        raw: { err: 0, ver: '2025.02.01.0002' },
        request: { local: ready }
      })
    })

    render(<USBDongle />)

    const uploadBtn = await screen.findByText('Upload')
    await waitFor(() => expect(uploadBtn.closest('button')).not.toBeDisabled())

    fireEvent.click(uploadBtn)

    await waitFor(() => {
      expect(screen.getByLabelText('FW Status: Uploading…')).toBeInTheDocument()
    })

    await act(async () => {
      up.resolve({
        ok: true,
        raw: { err: 0, ver: '2025.02.01.0002' },
        request: { local: ready }
      })
    })
  })

  test('shows firmware error status and dialog when check returns an api error message', async () => {
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async (action: string) => {
      if (action === 'check') return { ok: true, raw: { err: 1, msg: 'boom' }, request: {} }
      return {
        ok: true,
        raw: { err: 0, ver: '-' },
        request: { local: { ok: true, ready: false, reason: 'missing' } }
      }
    })

    render(<USBDongle />)

    await clickCheck()

    await waitFor(() => {
      expect(screen.getByLabelText('FW Status: Error: boom')).toBeInTheDocument()
    })
    expect(screen.getAllByText('boom').length).toBeGreaterThan(0)
  })

  test('falls back to raw error field when api message is missing', async () => {
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async (action: string) => {
      if (action === 'check') return { ok: true, raw: { err: 1, error: 'raw-error' }, request: {} }
      return {
        ok: true,
        raw: { err: 0, ver: '-' },
        request: { local: { ok: true, ready: false, reason: 'missing' } }
      }
    })

    render(<USBDongle />)

    await clickCheck()

    await waitFor(() => {
      expect(screen.getByLabelText('FW Status: Error: raw-error')).toBeInTheDocument()
    })
  })

  test('falls back to top level error field when raw error fields are missing', async () => {
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async (action: string) => {
      if (action === 'check') return { ok: true, raw: { err: 1 }, error: 'top-error', request: {} }
      return {
        ok: true,
        raw: { err: 0, ver: '-' },
        request: { local: { ok: true, ready: false, reason: 'missing' } }
      }
    })

    render(<USBDongle />)

    await clickCheck()

    await waitFor(() => {
      expect(screen.getByLabelText('FW Status: Error: top-error')).toBeInTheDocument()
    })
  })

  test('falls back to unknown error when no error fields are present', async () => {
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async (action: string) => {
      if (action === 'check') return { ok: false, raw: { err: 1 }, request: {} }
      return {
        ok: true,
        raw: { err: 0, ver: '-' },
        request: { local: { ok: true, ready: false, reason: 'missing' } }
      }
    })

    render(<USBDongle />)

    await clickCheck()

    await waitFor(() => {
      expect(screen.getByLabelText('FW Status: Error: Unknown error')).toBeInTheDocument()
    })
  })

  test('shows latest firmware label from dongle version when api reports no version', async () => {
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async (action: string) => {
      if (action === 'check') return { ok: true, raw: { err: 0 }, request: {} }
      return {
        ok: true,
        raw: { err: 0, ver: '-' },
        request: { local: { ok: true, ready: false, reason: 'missing' } }
      }
    })

    render(<USBDongle />)

    await clickCheck()

    await waitFor(() => {
      expect(screen.getByLabelText('Latest FW: 2025.01.01.0001')).toBeInTheDocument()
    })
  })

  test('shows ready local label in megabytes for large firmware', async () => {
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async () => ({
      ok: true,
      raw: { err: 0, ver: '2025.02.01.0002' },
      request: { local: readyLocal('2025.02.01.0002', '/tmp/fw.bin', 2 * 1024 * 1024) }
    }))

    render(<USBDongle />)

    await waitFor(() => {
      expect(screen.getByLabelText('Local FW: Ready • 2.0 MB')).toBeInTheDocument()
    })
  })

  test('shows not ready local label when firmware status has no reason', async () => {
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async () => ({
      ok: true,
      raw: { err: 0, ver: '-' },
      request: { local: { ok: true, ready: false } }
    }))

    render(<USBDongle />)

    await waitFor(() => {
      expect(screen.getByLabelText('Local FW: Not ready')).toBeInTheDocument()
    })
  })

  test('shows not ready local label when firmware status has no local data', async () => {
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async () => ({
      ok: true,
      raw: { err: 0, ver: '-' },
      request: {}
    }))

    render(<USBDongle />)

    await waitFor(() => {
      expect(screen.getByLabelText('Local FW: Not ready')).toBeInTheDocument()
    })
  })

  test('shows local error label when firmware status reports an error', async () => {
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async () => ({
      ok: true,
      raw: { err: 0, ver: '-' },
      request: { local: { ok: false, error: 'local-broke' } }
    }))

    render(<USBDongle />)

    await waitFor(() => {
      expect(screen.getByLabelText('Local FW: local-broke')).toBeInTheDocument()
    })
  })

  test('merges subsequent status responses into the existing firmware result', async () => {
    let calls = 0
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async () => {
      calls += 1
      const msg = calls === 1 ? 'm1' : calls === 2 ? 'm2' : undefined
      return {
        ok: true,
        raw: { err: 0, ver: '-', ...(msg !== undefined ? { msg } : {}) }
      }
    })

    const { rerender } = render(<USBDongle />)

    await waitFor(() => {
      expect(calls).toBeGreaterThanOrEqual(1)
    })

    state.dongleFwVersion = '2025.01.02.0002'
    rerender(<USBDongle />)

    await waitFor(() => {
      expect(calls).toBeGreaterThanOrEqual(2)
    })

    state.dongleFwVersion = '2025.01.03.0003'
    rerender(<USBDongle />)

    await waitFor(() => {
      expect(calls).toBeGreaterThanOrEqual(3)
    })
  })

  test('sets ip field from settings that omit a dongle tools ip', async () => {
    state.settings = {} as any

    render(<USBDongle />)

    const input = screen.getByLabelText('settings.dongleIpOptional') as HTMLInputElement
    expect(input.value).toBe('')
  })

  test('rejects an ip with too few segments', async () => {
    render(<USBDongle />)

    const input = screen.getByLabelText('settings.dongleIpOptional') as HTMLInputElement
    fireEvent.change(input, { target: { value: '1.2' } })

    fireEvent.click(screen.getByText('settings.enableDevTools'))

    await waitFor(() => {
      expect(screen.getAllByText(/settings.devToolsInvalidIp/).length).toBeGreaterThan(0)
    })
    expect((window as any).projection.usb.uploadLiviScripts).not.toHaveBeenCalled()
  })

  test('rejects an ip with an empty segment', async () => {
    render(<USBDongle />)

    const input = screen.getByLabelText('settings.dongleIpOptional') as HTMLInputElement
    fireEvent.change(input, { target: { value: '1.2.3.' } })

    fireEvent.click(screen.getByText('settings.enableDevTools'))

    await waitFor(() => {
      expect(screen.getAllByText(/settings.devToolsInvalidIp/).length).toBeGreaterThan(0)
    })
  })

  test('updates ip field placeholder on focus and blur', async () => {
    render(<USBDongle />)

    const input = screen.getByLabelText('settings.dongleIpOptional') as HTMLInputElement

    fireEvent.focus(input)
    expect(input.placeholder).toBe('settings.dongleIpMaskPlaceholder')

    fireEvent.blur(input)
    expect(input.placeholder).toBe('settings.dongleIpPlaceholder')
  })

  test('shows enabling and opening states while dev tools run', async () => {
    const up = deferred()
    const open = deferred()
    ;(window as any).projection.usb.uploadLiviScripts = vi.fn(() => up.promise)
    ;(window as any).app.openExternal = vi.fn(() => open.promise)

    render(<USBDongle />)

    fireEvent.click(screen.getByText('settings.enableDevTools'))
    fireEvent.click(screen.getByText('settings.enabling'))

    await waitFor(() => {
      expect(screen.getByText('settings.enabling')).toBeInTheDocument()
    })

    await act(async () => {
      up.resolve({ ok: true, cgiOk: true, webOk: true, urls: ['http://1.1.1.1/index.html'] })
    })

    await waitFor(() => {
      expect(screen.getByText('settings.opening')).toBeInTheDocument()
    })

    await act(async () => {
      open.resolve({ ok: true })
    })

    await waitFor(() => {
      expect(screen.getByText('settings.devToolsEnabled')).toBeInTheDocument()
    })
  })

  test('handles dev tools success with no open candidates', async () => {
    ;(window as any).projection.usb.uploadLiviScripts = vi
      .fn()
      .mockResolvedValue({ ok: true, cgiOk: true, webOk: true })

    render(<USBDongle />)

    fireEvent.click(screen.getByText('settings.enableDevTools'))

    await waitFor(() => {
      expect(screen.getByText('settings.devToolsEnabled')).toBeInTheDocument()
    })
    expect((window as any).app.openExternal).not.toHaveBeenCalled()
  })

  test('opens deduped index candidate and ignores malformed urls', async () => {
    ;(window as any).projection.usb.uploadLiviScripts = vi.fn().mockResolvedValue({
      ok: true,
      cgiOk: true,
      webOk: true,
      urls: [
        'http://[bad',
        'ftp://x/y',
        'http://5.5.5.5/index.html',
        'http://6.6.6.6/other',
        'http://6.6.6.6/other'
      ]
    })

    render(<USBDongle />)

    fireEvent.click(screen.getByText('settings.enableDevTools'))

    await waitFor(() => {
      expect((window as any).app.openExternal).toHaveBeenCalledWith('http://5.5.5.5/index.html')
    })
    expect((window as any).app.openExternal).toHaveBeenCalledWith('http://6.6.6.6/index.html')
  })

  test('logs unknown error when opening a url fails without an error message', async () => {
    ;(window as any).projection.usb.uploadLiviScripts = vi
      .fn()
      .mockResolvedValue({ ok: true, cgiOk: true, webOk: true, urls: [] })
    ;(window as any).app.openExternal = vi.fn().mockResolvedValue({ ok: false })

    render(<USBDongle />)

    const input = screen.getByLabelText('settings.dongleIpOptional') as HTMLInputElement
    fireEvent.change(input, { target: { value: '1.2.3.4' } })

    fireEvent.click(screen.getByText('settings.enableDevTools'))

    await waitFor(() => {
      expect(screen.getAllByText(/settings.devToolsOpenNoneFailed/).length).toBeGreaterThan(0)
    })
  })

  test('shows error alert when dev tools upload rejects with a non error value', async () => {
    ;(window as any).projection.usb.uploadLiviScripts = vi.fn().mockRejectedValue('string-failure')

    render(<USBDongle />)

    fireEvent.click(screen.getByText('settings.enableDevTools'))

    await waitFor(() => {
      expect(screen.getByText('string-failure')).toBeInTheDocument()
    })
  })

  test('ignores repeated enable clicks while dev tools are busy', async () => {
    const up = deferred()
    ;(window as any).projection.usb.uploadLiviScripts = vi.fn(() => up.promise)

    render(<USBDongle />)

    fireEvent.click(screen.getByText('settings.enableDevTools'))

    await waitFor(() => {
      expect((window as any).projection.usb.uploadLiviScripts).toHaveBeenCalledTimes(1)
    })

    fireEvent.click(screen.getByText('settings.enabling'))

    await act(async () => {
      up.resolve({ ok: true, cgiOk: true, webOk: true, urls: [] })
    })

    expect((window as any).projection.usb.uploadLiviScripts).toHaveBeenCalledTimes(1)
  })

  test('handles all firmware update event stages', async () => {
    render(<USBDongle />)

    act(() => onEventCb?.(null, 'not-a-record'))
    act(() => onEventCb?.(null, { type: 'other' }))
    act(() => onEventCb?.(null, { type: 'fwUpdate' }))
    act(() => onEventCb?.(null, { type: 'fwUpdate', stage: null }))
    act(() => onEventCb?.(null, { type: 'fwUpdate', stage: 123 }))
    expect(screen.queryByText('Dongle Firmware')).not.toBeInTheDocument()

    act(() => onEventCb?.(null, { type: 'fwUpdate', stage: 'download:start' }))
    expect(screen.getByText('Starting…')).toBeInTheDocument()

    act(() =>
      onEventCb?.(null, {
        type: 'fwUpdate',
        stage: 'download:progress',
        received: 512,
        total: 1024
      })
    )
    expect(screen.getByText('Downloading')).toBeInTheDocument()

    act(() => onEventCb?.(null, { type: 'fwUpdate', stage: 'download:progress' }))
    act(() => onEventCb?.(null, { type: 'fwUpdate', stage: 'download:error' }))
    expect(screen.getByText('Download failed')).toBeInTheDocument()
    expect(screen.getByText('Error')).toBeInTheDocument()

    act(() => onEventCb?.(null, { type: 'fwUpdate', stage: 'download:error', message: 'dlfail' }))
    expect(screen.getByText('dlfail')).toBeInTheDocument()

    act(() => onEventCb?.(null, { type: 'fwUpdate', stage: 'upload:start' }))
    act(() => onEventCb?.(null, { type: 'fwUpdate', stage: 'upload:progress', progress: 40 }))
    expect(screen.getByText('Uploading')).toBeInTheDocument()

    act(() => onEventCb?.(null, { type: 'fwUpdate', stage: 'upload:start' }))
    act(() => onEventCb?.(null, { type: 'fwUpdate', stage: 'upload:state', isTerminal: false }))
    expect(screen.getByText('Update in progress…')).toBeInTheDocument()

    act(() =>
      onEventCb?.(null, { type: 'fwUpdate', stage: 'upload:progress', sent: 256, total: 512 })
    )
    act(() =>
      onEventCb?.(null, { type: 'fwUpdate', stage: 'upload:progress', percent: 0.75, total: 200 })
    )
    act(() => onEventCb?.(null, { type: 'fwUpdate', stage: 'upload:progress' }))

    act(() =>
      onEventCb?.(null, {
        type: 'fwUpdate',
        stage: 'upload:state',
        statusText: 'Flashing',
        isTerminal: false
      })
    )
    expect(screen.getByText('Flashing')).toBeInTheDocument()

    act(() => onEventCb?.(null, { type: 'fwUpdate', stage: 'upload:state', isTerminal: false }))
    act(() =>
      onEventCb?.(null, {
        type: 'fwUpdate',
        stage: 'upload:state',
        isTerminal: true,
        ok: false,
        statusText: 'Bad'
      })
    )
    expect(screen.getByText('Bad')).toBeInTheDocument()

    act(() =>
      onEventCb?.(null, { type: 'fwUpdate', stage: 'upload:state', isTerminal: true, ok: false })
    )
    act(() =>
      onEventCb?.(null, {
        type: 'fwUpdate',
        stage: 'upload:state',
        isTerminal: true,
        ok: true,
        statusText: 'Great'
      })
    )
    expect(screen.getByText('Great')).toBeInTheDocument()

    act(() => onEventCb?.(null, { type: 'fwUpdate', stage: 'upload:done' }))
    expect(screen.getByText('Upload complete')).toBeInTheDocument()

    act(() => onEventCb?.(null, { type: 'fwUpdate', stage: 'upload:done', message: 'All done' }))
    expect(screen.getByText('All done')).toBeInTheDocument()

    act(() => onEventCb?.(null, { type: 'fwUpdate', stage: 'upload:error' }))
    expect(screen.getByText('Upload failed')).toBeInTheDocument()

    act(() => onEventCb?.(null, { type: 'fwUpdate', stage: 'upload:error', message: 'Boom up' }))
    expect(screen.getByText('Boom up')).toBeInTheDocument()
  })

  test('shows byte progress text for download progress without an explicit percent', async () => {
    render(<USBDongle />)

    act(() =>
      onEventCb?.(null, {
        type: 'fwUpdate',
        stage: 'download:progress',
        received: 512,
        total: 1024
      })
    )

    expect(screen.getByText(/50% •/)).toBeInTheDocument()
  })

  test('auto closes firmware dialog after download done without a path', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    render(<USBDongle />)

    act(() => {
      onEventCb?.(null, { type: 'fwUpdate', stage: 'download:start' })
      onEventCb?.(null, { type: 'fwUpdate', stage: 'download:done' })
    })

    expect(screen.getByText('Saved')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(900)
    })

    await waitFor(() => {
      expect(screen.queryByText('Dongle Firmware')).not.toBeInTheDocument()
    })

    vi.useRealTimers()
  })

  test('firmware dialog ignores escape key and backdrop clicks', async () => {
    render(<USBDongle />)

    act(() => onEventCb?.(null, { type: 'fwUpdate', stage: 'download:start' }))
    expect(screen.getByText('Dongle Firmware')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByText('Dongle Firmware'), { key: 'Escape', code: 'Escape' })
    expect(screen.getByText('Dongle Firmware')).toBeInTheDocument()

    const backdrop = document.querySelector('.MuiBackdrop-root') as HTMLElement
    fireEvent.click(backdrop)
    expect(screen.getByText('Dongle Firmware')).toBeInTheDocument()
  })

  test('closes the changelog dialog via escape and the close button', async () => {
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async (action: string) => ({
      ok: true,
      raw: {
        err: 0,
        ver: action === 'check' ? '2025.02.01.0001' : '-',
        notes: 'Vendor notes'
      },
      request: { local: { ok: true, ready: false, reason: 'missing' } }
    }))

    render(<USBDongle />)

    const changelogBtn = await screen.findByText('Changelog')
    await waitFor(() => expect(changelogBtn.closest('button')).not.toBeDisabled())

    fireEvent.click(changelogBtn)
    expect(screen.getByText('Vendor changelog')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByText('Vendor changelog'), { key: 'Escape', code: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByText('Vendor changelog')).not.toBeInTheDocument()
    })

    fireEvent.click(changelogBtn)
    fireEvent.click(screen.getByText('Close'))
    await waitFor(() => {
      expect(screen.queryByText('Vendor changelog')).not.toBeInTheDocument()
    })
  })

  test('download proceeds when the status preflight throws', async () => {
    let breakStatus = false
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async (action: string) => {
      if (action === 'status' && breakStatus) throw new Error('pre boom')
      return {
        ok: true,
        raw: { err: 0, ver: '2025.02.01.0001' },
        request: { local: { ok: true, ready: false, reason: 'missing' } }
      }
    })

    render(<USBDongle />)

    const downloadBtn = await screen.findByText('Download')
    await waitFor(() => expect(downloadBtn.closest('button')).not.toBeDisabled())

    breakStatus = true
    fireEvent.click(downloadBtn)

    await waitFor(() => {
      expect((window as any).projection.ipc.dongleFirmware).toHaveBeenCalledWith('download')
    })
  })

  test('download proceeds when the status preflight response is invalid', async () => {
    let breakStatus = false
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async (action: string) => {
      if (action === 'status' && breakStatus) return { nope: true }
      return {
        ok: true,
        raw: { err: 0, ver: '2025.02.01.0001' },
        request: { local: { ok: true, ready: false, reason: 'missing' } }
      }
    })

    render(<USBDongle />)

    const downloadBtn = await screen.findByText('Download')
    await waitFor(() => expect(downloadBtn.closest('button')).not.toBeDisabled())

    breakStatus = true
    fireEvent.click(downloadBtn)

    await waitFor(() => {
      expect((window as any).projection.ipc.dongleFirmware).toHaveBeenCalledWith('download')
    })
  })

  test('shows already downloaded without a path when firmware is ready but path is empty', async () => {
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async () => ({
      ok: true,
      raw: { err: 0, ver: '2025.02.01.0002' },
      request: { local: { ok: true, ready: true, bytes: 4096, latestVer: '2025.02.01.0002' } }
    }))

    render(<USBDongle />)

    const downloadBtn = await screen.findByText('Download')
    await waitFor(() => expect(downloadBtn.closest('button')).not.toBeDisabled())

    fireEvent.click(downloadBtn)

    await waitFor(() => {
      expect(screen.getByText('Already downloaded.')).toBeInTheDocument()
    })
  })

  test('uploads even when the local firmware path is empty', async () => {
    const ready = { ok: true, ready: true, path: '', bytes: 4096, latestVer: '2025.02.01.0002' }
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async () => ({
      ok: true,
      raw: { err: 0, ver: '2025.02.01.0002' },
      request: { local: ready }
    }))

    render(<USBDongle />)

    const uploadBtn = await screen.findByText('Upload')
    await waitFor(() => expect(uploadBtn.closest('button')).not.toBeDisabled())

    fireEvent.click(uploadBtn)

    await waitFor(() => {
      expect((window as any).projection.ipc.dongleFirmware).toHaveBeenCalledWith('upload')
    })
  })

  test('shows an error dialog when the initial status action rejects with an error', async () => {
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async () => {
      throw new Error('status rejected')
    })

    render(<USBDongle />)

    await waitFor(() => {
      expect(screen.getAllByText('status rejected').length).toBeGreaterThan(0)
    })
    expect(screen.getByText('Close')).toBeInTheDocument()
  })

  test('shows an error dialog when the check action rejects with a non error value', async () => {
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async (action: string) => {
      if (action === 'check') throw 'plain string failure'
      return {
        ok: true,
        raw: { err: 0, ver: '-' },
        request: { local: { ok: true, ready: false, reason: 'missing' } }
      }
    })

    render(<USBDongle />)

    await clickCheck()

    await waitFor(() => {
      expect(screen.getAllByText('plain string failure').length).toBeGreaterThan(0)
    })
  })

  test('shows invalid response dialog for a null check response', async () => {
    await expectInvalidCheck(null)
  })

  test('shows invalid response dialog for a string check response', async () => {
    await expectInvalidCheck('string-response')
  })

  test('shows invalid response dialog for a number check response', async () => {
    await expectInvalidCheck(42)
  })

  test('shows invalid response dialog for a boolean check response', async () => {
    await expectInvalidCheck(true)
  })

  test('shows invalid response dialog for a large object check response', async () => {
    await expectInvalidCheck({
      a: 'x'.repeat(3000),
      b: 'y'.repeat(3000),
      c: 'z'.repeat(3000),
      d: 'w'.repeat(3000)
    })
  })

  test('shows invalid response dialog for a small object check response', async () => {
    await expectInvalidCheck({ small: 'object', count: 2 })
  })

  test('shows invalid response dialog for an unstringifiable check response', async () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    await expectInvalidCheck(circular)
  })

  test('falls back to empty latest label when the dongle version is cleared', async () => {
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async () => ({
      ok: true,
      raw: { err: 0 },
      request: { local: { ok: true, ready: false, reason: 'missing' } }
    }))

    const { rerender } = render(<USBDongle />)

    await waitFor(() => {
      expect(screen.getByLabelText('Latest FW: 2025.01.01.0001')).toBeInTheDocument()
    })

    state.dongleFwVersion = ''
    rerender(<USBDongle />)

    await waitFor(() => {
      expect(screen.getByLabelText('Latest FW: —')).toBeInTheDocument()
    })
  })

  test('renders a dash for the dongle firmware row when the version is not a string', async () => {
    state.dongleFwVersion = undefined as any

    render(<USBDongle />)

    expect(screen.getByLabelText('Dongle FW: —')).toBeInTheDocument()
  })

  test('merges the preflight status when neither result carries a request', async () => {
    ;(window as any).projection.ipc.dongleFirmware = vi.fn(async () => ({
      ok: true,
      raw: { err: 0, ver: '2025.02.01.0001' }
    }))

    render(<USBDongle />)

    const downloadBtn = await screen.findByText('Download')
    await waitFor(() => expect(downloadBtn.closest('button')).not.toBeDisabled())

    fireEvent.click(downloadBtn)

    await waitFor(() => {
      expect((window as any).projection.ipc.dongleFirmware).toHaveBeenCalledWith('download')
    })
  })

  test('cancels a pending auto close timer when the dialog state changes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })

    render(<USBDongle />)

    act(() => {
      onEventCb?.(null, { type: 'fwUpdate', stage: 'download:start' })
      onEventCb?.(null, { type: 'fwUpdate', stage: 'download:done', path: '/tmp/fw.bin' })
    })

    act(() => {
      onEventCb?.(null, {
        type: 'fwUpdate',
        stage: 'download:progress',
        received: 10,
        total: 100
      })
    })

    act(() => {
      vi.advanceTimersByTime(900)
    })

    expect(screen.getByText('Dongle Firmware')).toBeInTheDocument()

    vi.useRealTimers()
  })
})

async function expectInvalidCheck(value: unknown) {
  ;(window as any).projection.ipc.dongleFirmware = vi.fn(async (action: string) =>
    action === 'check'
      ? value
      : {
          ok: true,
          raw: { err: 0, ver: '-' },
          request: { local: { ok: true, ready: false, reason: 'missing' } }
        }
  )

  render(<USBDongle />)

  await waitFor(() => {
    expect((window as any).projection.ipc.dongleFirmware).toHaveBeenCalledWith('status')
  })

  fireEvent.click(screen.getByText('Check for Updates'))

  await waitFor(() => {
    expect(screen.getByText('Invalid response from main process')).toBeInTheDocument()
  })
}
