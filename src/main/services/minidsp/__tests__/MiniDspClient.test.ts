import { DEFAULT_CONFIG } from '@shared/types'
import { MiniDspClient } from '../MiniDspClient'

const config = () => ({ ...DEFAULT_CONFIG.minidsp })

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })

describe('MiniDspClient', () => {
  afterEach(() => vi.unstubAllGlobals())

  test('reports disconnected when daemon has no devices', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(new MiniDspClient(config()).getStatus()).resolves.toEqual({
      connected: false,
      preset: 0,
      source: '',
      volumeDb: -80,
      muted: false
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:5380/devices')
  })

  test('returns a clear error when daemon is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))

    await expect(new MiniDspClient(config()).getStatus()).rejects.toThrow(
      'Cannot connect to MiniDSP daemon at http://127.0.0.1:5380. Make sure minidspd is running.'
    )
  })

  test('reads selected device status after detection', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ product_name: '2x4HD' }]))
      .mockResolvedValueOnce(
        jsonResponse({ master: { preset: 2, source: 'Toslink', volume: -18.5, mute: false } })
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(new MiniDspClient(config()).getStatus()).resolves.toEqual({
      connected: true,
      preset: 2,
      source: 'Toslink',
      volumeDb: -18.5,
      muted: false,
      productName: '2x4HD'
    })
    expect(fetchMock.mock.calls[1][0]).toBe('http://127.0.0.1:5380/devices/0')
  })
})
