import type { ProjectionSession } from '@main/services/projection/services/SessionManager'
import { logSessions } from '@main/services/projection/services/sessionLog'

function fakeSession(over: Record<string, unknown> = {}): ProjectionSession {
  return {
    index: 1,
    protocol: 'aa',
    transport: 'usb',
    state: 'active',
    video: { main: { codec: 'h264' }, cluster: { codec: null } },
    device: {},
    ...over
  } as unknown as ProjectionSession
}

describe('logSessions', () => {
  test('prints a placeholder when there are no sessions', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(function () {})
    logSessions('empty', [])
    expect(log).toHaveBeenCalledWith(expect.stringContaining('(no sessions)'))
    log.mockRestore()
  })

  test('prints one row per session with state and codecs', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(function () {})
    logSessions('update', [
      fakeSession(),
      fakeSession({ index: 2, state: 'held', video: { main: {}, cluster: { codec: 'h265' } } })
    ])
    const out = log.mock.calls[0][0] as string
    expect(out).toContain('SESSIONS · update')
    expect(out).toContain('ACTIVE')
    expect(out).toContain('held')
    expect(out).toContain('main:h264')
    expect(out).toContain('cluster:h265')
    expect(out).toContain('main:-')
    log.mockRestore()
  })

  test('formats all known device keys and a placeholder when none are set', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(function () {})
    logSessions('keys', [
      fakeSession({
        device: {
          btMac: 'AA',
          wifiMac: 'BB',
          usbUdid: 'CC',
          instanceId: 'DD',
          controllerId: 'EE',
          ip: '10.0.0.2'
        }
      }),
      fakeSession({ index: 2 })
    ])
    const out = log.mock.calls[0][0] as string
    expect(out).toContain('bt=AA wifi=BB udid=CC inst=DD ctrl=EE ip=10.0.0.2')
    expect(out).toContain('(none)')
    log.mockRestore()
  })
})
