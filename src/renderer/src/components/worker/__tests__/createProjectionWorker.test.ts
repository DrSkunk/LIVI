import { createProjectionWorker } from '../createProjectionWorker'

describe('createProjectionWorker', () => {
  const OriginalWorker = (global as { Worker?: unknown }).Worker
  let calls: Array<{ url: unknown; opts: unknown }>

  beforeEach(() => {
    calls = []
    ;(global as { Worker?: unknown }).Worker = class {
      constructor(url: unknown, opts: unknown) {
        calls.push({ url, opts })
      }
    }
  })

  afterEach(() => {
    ;(global as { Worker?: unknown }).Worker = OriginalWorker
  })

  test('constructs a module worker for the projection worker entry', () => {
    const worker = createProjectionWorker()

    expect(worker).toBeInstanceOf((global as { Worker: new () => unknown }).Worker)
    expect(calls).toHaveLength(1)
    expect(String(calls[0].url)).toContain('Projection.worker')
    expect(calls[0].opts).toEqual({ type: 'module' })
  })
})
