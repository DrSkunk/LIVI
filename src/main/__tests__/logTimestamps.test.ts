type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug'

const METHODS: ConsoleMethod[] = ['log', 'info', 'warn', 'error', 'debug']

describe('logTimestamps', () => {
  test('prefixes every console method with a wall-clock timestamp', async () => {
    vi.resetModules()
    const original = new Map(METHODS.map((m) => [m, console[m]]))
    const spies = Object.fromEntries(METHODS.map((m) => [m, vi.fn()])) as Record<
      ConsoleMethod,
      ReturnType<typeof vi.fn>
    >
    for (const m of METHODS) console[m] = spies[m]
    try {
      await import('../logTimestamps')
      console.log('a', 1)
      console.info('b')
      console.warn('c')
      console.error('d')
      console.debug('e')
      const ts = expect.stringMatching(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\]$/)
      expect(spies.log).toHaveBeenCalledWith(ts, 'a', 1)
      expect(spies.info).toHaveBeenCalledWith(ts, 'b')
      expect(spies.warn).toHaveBeenCalledWith(ts, 'c')
      expect(spies.error).toHaveBeenCalledWith(ts, 'd')
      expect(spies.debug).toHaveBeenCalledWith(ts, 'e')
    } finally {
      for (const m of METHODS) {
        const fn = original.get(m)
        if (fn) console[m] = fn
      }
    }
  })
})
