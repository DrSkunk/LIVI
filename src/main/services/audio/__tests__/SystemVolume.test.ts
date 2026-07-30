import { EventEmitter } from 'node:events'
import type { Mock } from 'vitest'

const { execFileMock, spawnMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  spawnMock: vi.fn()
}))

vi.mock('child_process', () => ({ execFile: execFileMock, spawn: spawnMock }))

type SystemVolumeModule = typeof import('../SystemVolume')

async function load(debug: boolean): Promise<SystemVolumeModule> {
  vi.resetModules()
  vi.doMock('@main/constants', () => ({ DEBUG: debug }))
  return await import('../SystemVolume')
}

type FakeProc = EventEmitter & {
  stdout: EventEmitter & { setEncoding: Mock }
  kill: Mock
  killed: boolean
}

function makeProc(): FakeProc {
  const proc = new EventEmitter() as FakeProc
  proc.stdout = Object.assign(new EventEmitter(), { setEncoding: vi.fn() }) as FakeProc['stdout']
  proc.kill = vi.fn()
  proc.killed = false
  return proc
}

function pactlAnswers(volumePercent: number | Error): void {
  execFileMock.mockImplementation(
    (
      _cmd: string,
      _args: string[],
      _opts: unknown,
      cb: (e: Error | null, out?: string) => void
    ) => {
      if (volumePercent instanceof Error) cb(volumePercent)
      else cb(null, `Volume: front-left: 42000 / ${volumePercent}% / -10 dB`)
    }
  )
}

const originalPlatform = process.platform
let logSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  execFileMock.mockReset()
  spawnMock.mockReset()
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
  logSpy.mockRestore()
  warnSpy.mockRestore()
  vi.useRealTimers()
})

describe('parseSinkVolume', () => {
  test('reads the first percentage', async () => {
    const { parseSinkVolume } = await load(false)
    expect(parseSinkVolume('Volume: front-left: 42000 / 65% / -10 dB')).toBe(0.65)
  })

  test('clamps above 100%', async () => {
    const { parseSinkVolume } = await load(false)
    expect(parseSinkVolume('Volume: 150%')).toBe(1)
  })

  test('returns null without a percentage', async () => {
    const { parseSinkVolume } = await load(false)
    expect(parseSinkVolume('no volume here')).toBeNull()
  })

  test('returns null for an absurdly long number', async () => {
    const { parseSinkVolume } = await load(false)
    expect(parseSinkVolume(`Volume: ${'9'.repeat(400)}%`)).toBeNull()
  })
})

describe('getSystemVolume', () => {
  test('reads the configured sink', async () => {
    const { getSystemVolume } = await load(false)
    pactlAnswers(65)
    await expect(getSystemVolume(' alsa:hw0 ')).resolves.toBe(0.65)
    expect(execFileMock.mock.calls[0][1]).toEqual(['get-sink-volume', 'alsa:hw0'])
  })

  test('falls back to the default sink', async () => {
    const { getSystemVolume } = await load(false)
    pactlAnswers(30)
    await expect(getSystemVolume()).resolves.toBe(0.3)
    expect(execFileMock.mock.calls[0][1]).toEqual(['get-sink-volume', '@DEFAULT_SINK@'])
  })

  test('returns null when pactl fails, warning only in debug builds', async () => {
    const debugMod = await load(true)
    pactlAnswers(new Error('not installed'))
    await expect(debugMod.getSystemVolume()).resolves.toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('pactl get-sink-volume'))

    warnSpy.mockClear()
    const quietMod = await load(false)
    await expect(quietMod.getSystemVolume()).resolves.toBeNull()
    expect(warnSpy).not.toHaveBeenCalled()
  })

  test('resolves null off linux without calling pactl', async () => {
    const { getSystemVolume } = await load(false)
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    await expect(getSystemVolume()).resolves.toBeNull()
    expect(execFileMock).not.toHaveBeenCalled()
  })
})

describe('setSystemVolume', () => {
  test('sets the clamped level and reports success', async () => {
    const { setSystemVolume } = await load(false)
    pactlAnswers(0)
    await expect(setSystemVolume(1.5, 'alsa:hw0')).resolves.toBe(true)
    expect(execFileMock.mock.calls[0][1]).toEqual(['set-sink-volume', 'alsa:hw0', '100%'])
    expect(logSpy).toHaveBeenCalledWith('[SystemVolume] system volume → 100 %')
  })

  test('clamps negative levels to zero', async () => {
    const { setSystemVolume } = await load(false)
    pactlAnswers(0)
    await expect(setSystemVolume(-0.5)).resolves.toBe(true)
    expect(execFileMock.mock.calls[0][1]).toEqual(['set-sink-volume', '@DEFAULT_SINK@', '0%'])
  })

  test('warns and returns false when pactl fails', async () => {
    const { setSystemVolume } = await load(false)
    pactlAnswers(new Error('missing'))
    await expect(setSystemVolume(0.5)).resolves.toBe(false)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('could not set'))
  })
})

describe('startSystemVolumeMonitor', () => {
  async function startWith(mod: SystemVolumeModule, proc: FakeProc): Promise<{ onChange: Mock }> {
    spawnMock.mockReturnValue(proc)
    const onChange = vi.fn()
    mod.startSystemVolumeMonitor(() => undefined, onChange)
    return { onChange }
  }

  async function flushDebounce(): Promise<void> {
    await vi.advanceTimersByTimeAsync(200)
  }

  test('stays inactive off linux', async () => {
    const mod = await load(false)
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    mod.startSystemVolumeMonitor(() => undefined, vi.fn())
    expect(spawnMock).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('not available'))
    mod.stopSystemVolumeMonitor()
  })

  test('reports sink changes made outside LIVI', async () => {
    vi.useFakeTimers()
    const mod = await load(true)
    const proc = makeProc()
    const { onChange } = await startWith(mod, proc)

    expect(spawnMock).toHaveBeenCalledWith('pactl', ['subscribe'], {
      stdio: ['ignore', 'pipe', 'ignore']
    })
    pactlAnswers(65)
    proc.stdout.emit('data', "Event 'change' on si")
    proc.stdout.emit('data', "nk #55\nEvent 'new' on client #3\n")
    await flushDebounce()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(0.65)
    expect(logSpy).toHaveBeenCalledWith('[SystemVolume] sink reports 65 %')

    mod.stopSystemVolumeMonitor()
  })

  test('debounces bursts and drops unchanged levels', async () => {
    vi.useFakeTimers()
    const mod = await load(false)
    const proc = makeProc()
    const { onChange } = await startWith(mod, proc)

    pactlAnswers(65)
    proc.stdout.emit('data', "Event 'change' on sink #55\nEvent 'change' on sink #55\n")
    await flushDebounce()
    expect(onChange).toHaveBeenCalledTimes(1)

    proc.stdout.emit('data', "Event 'change' on sink #55\n")
    await flushDebounce()
    expect(onChange).toHaveBeenCalledTimes(1)

    pactlAnswers(70)
    proc.stdout.emit('data', "Event 'change' on sink #55\n")
    await flushDebounce()
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith(0.7)

    mod.stopSystemVolumeMonitor()
  })

  test('suppresses the echo of our own volume writes', async () => {
    vi.useFakeTimers()
    const mod = await load(false)
    const proc = makeProc()
    const { onChange } = await startWith(mod, proc)

    pactlAnswers(80)
    await mod.setSystemVolume(0.8)
    proc.stdout.emit('data', "Event 'change' on sink #55\n")
    await flushDebounce()
    expect(onChange).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(500)
    proc.stdout.emit('data', "Event 'change' on sink #55\n")
    await flushDebounce()
    expect(onChange).toHaveBeenCalledWith(0.8)

    mod.stopSystemVolumeMonitor()
  })

  test('ignores unreadable levels', async () => {
    vi.useFakeTimers()
    const mod = await load(false)
    const proc = makeProc()
    const { onChange } = await startWith(mod, proc)

    pactlAnswers(new Error('gone'))
    proc.stdout.emit('data', "Event 'change' on sink #55\n")
    await flushDebounce()
    expect(onChange).not.toHaveBeenCalled()

    mod.stopSystemVolumeMonitor()
  })

  test('never stacks a second watcher', async () => {
    vi.useFakeTimers()
    const mod = await load(false)
    const proc = makeProc()
    await startWith(mod, proc)
    mod.startSystemVolumeMonitor(() => undefined, vi.fn())
    expect(spawnMock).toHaveBeenCalledTimes(1)
    mod.stopSystemVolumeMonitor()
  })

  test('restarts the pactl subscription after it dies', async () => {
    vi.useFakeTimers()
    const mod = await load(true)
    const proc = makeProc()
    await startWith(mod, proc)

    proc.emit('error', new Error('crashed'))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('subscribe failed'))

    const second = makeProc()
    spawnMock.mockReturnValue(second)
    proc.emit('exit', 1)
    await vi.advanceTimersByTimeAsync(2500)
    expect(spawnMock).toHaveBeenCalledTimes(2)

    mod.stopSystemVolumeMonitor()
  })

  test('swallows subscribe errors outside debug builds', async () => {
    vi.useFakeTimers()
    const mod = await load(false)
    const proc = makeProc()
    await startWith(mod, proc)
    proc.emit('error', new Error('crashed'))
    expect(warnSpy).not.toHaveBeenCalled()
    mod.stopSystemVolumeMonitor()
  })

  test('stop kills the watcher and cancels pending work', async () => {
    vi.useFakeTimers()
    const mod = await load(false)
    const proc = makeProc()
    const { onChange } = await startWith(mod, proc)

    pactlAnswers(65)
    proc.stdout.emit('data', "Event 'change' on sink #55\n")
    mod.stopSystemVolumeMonitor()
    expect(proc.kill).toHaveBeenCalledTimes(1)
    expect(logSpy).toHaveBeenCalledWith('[SystemVolume] sink watcher stopped')

    await flushDebounce()
    expect(onChange).not.toHaveBeenCalled()

    proc.emit('exit', 0)
    await vi.advanceTimersByTimeAsync(2500)
    expect(spawnMock).toHaveBeenCalledTimes(1)

    mod.stopSystemVolumeMonitor()
  })

  test('stop cancels a pending restart and tolerates a dead child', async () => {
    vi.useFakeTimers()
    const mod = await load(false)
    const proc = makeProc()
    await startWith(mod, proc)

    proc.emit('exit', 1)
    mod.stopSystemVolumeMonitor()
    await vi.advanceTimersByTimeAsync(2500)
    expect(spawnMock).toHaveBeenCalledTimes(1)

    const mod2 = await load(false)
    const proc2 = makeProc()
    proc2.killed = true
    spawnMock.mockReturnValue(proc2)
    mod2.startSystemVolumeMonitor(() => undefined, vi.fn())
    mod2.stopSystemVolumeMonitor()
    expect(proc2.kill).not.toHaveBeenCalled()
  })

  test('stop survives a kill that throws', async () => {
    vi.useFakeTimers()
    const mod = await load(false)
    const proc = makeProc()
    proc.kill.mockImplementation(() => {
      throw new Error('ESRCH')
    })
    await startWith(mod, proc)
    expect(() => mod.stopSystemVolumeMonitor()).not.toThrow()
  })

  test('stopSystemVolumeMonitor without a watcher is a no-op', async () => {
    const mod = await load(false)
    logSpy.mockClear()
    mod.stopSystemVolumeMonitor()
    expect(logSpy).not.toHaveBeenCalled()
  })

  test('drops a level read that lands after stop', async () => {
    vi.useFakeTimers()
    const mod = await load(false)
    const proc = makeProc()
    const { onChange } = await startWith(mod, proc)

    let answer!: (e: Error | null, out?: string) => void
    execFileMock.mockImplementation(
      (_c: string, _a: string[], _o: unknown, cb: (e: Error | null, out?: string) => void) => {
        answer = cb
      }
    )
    proc.stdout.emit('data', "Event 'change' on sink #55\n")
    await vi.advanceTimersByTimeAsync(150)
    mod.stopSystemVolumeMonitor()
    answer(null, 'Volume: 65%')
    await vi.advanceTimersByTimeAsync(50)
    expect(onChange).not.toHaveBeenCalled()
  })
})
