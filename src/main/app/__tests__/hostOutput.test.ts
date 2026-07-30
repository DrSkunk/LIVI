import { execFileSync } from 'node:child_process'
import type { Mock } from 'vitest'
import { applyHostOutputMode, hostOutputName, listHostOutputModes } from '../hostOutput'

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }))

const mockedExec = execFileSync as Mock

const WLR_OUTPUT = [
  'HDMI-A-1 "Panel Corp 7in (HDMI-A-1)"',
  '  Modes:',
  '    800x480 px, 60.000000 Hz (preferred, current)',
  '    1024x600 px, 60.000000 Hz',
  '    800x480 px, 75.000000 Hz',
  '    640x480 px, 59.940 Hz',
  ''
].join('\n')

describe('hostOutput', () => {
  const originalPlatform = process.platform

  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    mockedExec.mockReturnValue(WLR_OUTPUT)
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  })

  describe('hostOutputName', () => {
    test('returns the first output name from wlr-randr', () => {
      expect(hostOutputName()).toBe('HDMI-A-1')
      const [cmd, args, opts] = mockedExec.mock.calls[0]
      expect(cmd).toBe('wlr-randr')
      expect(args).toEqual([])
      expect(opts.env.WAYLAND_DISPLAY).toBe('wayland-0')
    })

    test('returns null when wlr-randr fails', () => {
      mockedExec.mockImplementation(() => {
        throw new Error('no display')
      })
      expect(hostOutputName()).toBeNull()
    })

    test('returns null off linux without running anything', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
      expect(hostOutputName()).toBeNull()
      expect(mockedExec).not.toHaveBeenCalled()
    })

    test('returns null for empty output', () => {
      mockedExec.mockReturnValue('')
      expect(hostOutputName()).toBeNull()
    })
  })

  describe('listHostOutputModes', () => {
    test('lists deduplicated modes widest first', () => {
      expect(listHostOutputModes()).toEqual(['1024x600', '800x480', '640x480'])
    })

    test('returns an empty list when wlr-randr fails', () => {
      mockedExec.mockImplementation(() => {
        throw new Error('no display')
      })
      expect(listHostOutputModes()).toEqual([])
    })
  })

  describe('applyHostOutputMode', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>
    let logSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
      warnSpy.mockRestore()
      logSpy.mockRestore()
    })

    test('ignores malformed mode strings', () => {
      applyHostOutputMode('')
      applyHostOutputMode('auto')
      applyHostOutputMode('800x')
      expect(mockedExec).not.toHaveBeenCalled()
    })

    test('warns when no host output is reachable', () => {
      mockedExec.mockImplementation(() => {
        throw new Error('no display')
      })
      applyHostOutputMode('800x480')
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no host output'))
    })

    test('warns when the output does not offer the mode', () => {
      applyHostOutputMode('1920x1080')
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('does not offer 1920x1080'))
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('1024x600, 800x480, 640x480'))
    })

    test('reports "none" when the output offers no modes at all', () => {
      mockedExec.mockReturnValue('HDMI-A-1 "Panel"\n')
      applyHostOutputMode('800x480')
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('offered: none'))
    })

    test('warns when the output refuses the mode switch', () => {
      mockedExec
        .mockReturnValueOnce(WLR_OUTPUT)
        .mockReturnValueOnce(WLR_OUTPUT)
        .mockImplementationOnce(() => {
          throw new Error('refused')
        })
      applyHostOutputMode('800x480')
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('refused 800x480'))
    })

    test('switches the mode and logs the result', () => {
      applyHostOutputMode('800x480')
      expect(mockedExec).toHaveBeenLastCalledWith(
        'wlr-randr',
        ['--output', 'HDMI-A-1', '--mode', '800x480'],
        expect.objectContaining({ timeout: 3000 })
      )
      expect(logSpy).toHaveBeenCalledWith('[hostOutput] HDMI-A-1 → 800x480')
      expect(warnSpy).not.toHaveBeenCalled()
    })
  })
})
