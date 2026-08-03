import { execFile } from 'node:child_process'
import { BluetoothControllerService } from '../BluetoothControllerService'

vi.mock('node:child_process', () => ({ execFile: vi.fn() }))

const execMock = vi.mocked(execFile)

function reply(stdout: string, stderr = '', error: Error | null = null): void {
  execMock.mockImplementationOnce(((_file, _args, _options, callback) => {
    callback?.(error, stdout, stderr)
    return {} as never
  }) as typeof execFile)
}

describe('BluetoothControllerService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux')
  })

  test('lists discovered controllers and paired devices', async () => {
    reply('Device AA:BB:CC:DD:EE:FF 8BitDo Pro 2\nDevice 11:22:33:44:55:66 Pixel\n')
    reply(`Name: 8BitDo Pro 2\nIcon: input-gaming\nPaired: no\nConnected: no\n`)
    reply(`Name: Pixel\nIcon: phone\nPaired: no\nConnected: no\n`)

    await expect(new BluetoothControllerService().list()).resolves.toEqual([
      {
        mac: 'AA:BB:CC:DD:EE:FF',
        name: '8BitDo Pro 2',
        paired: false,
        connected: false
      }
    ])
  })

  test('pairs, trusts, and connects a controller', async () => {
    reply('Pairing successful')
    reply('trust succeeded')
    reply('Connection successful')

    await expect(new BluetoothControllerService().pair('aa:bb:cc:dd:ee:ff')).resolves.toEqual({
      ok: true
    })

    expect(execMock.mock.calls.map((call) => call[1])).toEqual([
      ['--agent', 'NoInputNoOutput', '--timeout', '45', 'pair', 'AA:BB:CC:DD:EE:FF'],
      ['trust', 'AA:BB:CC:DD:EE:FF'],
      ['--timeout', '15', 'connect', 'AA:BB:CC:DD:EE:FF']
    ])
  })

  test('rejects invalid Bluetooth addresses before executing commands', async () => {
    await expect(new BluetoothControllerService().pair('bad; address')).rejects.toThrow(
      'Invalid Bluetooth address'
    )
    expect(execMock).not.toHaveBeenCalled()
  })
})
