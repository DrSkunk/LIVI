import { EventEmitter } from 'node:events'
import type { Mock } from 'vitest'

let capturedOpts: Record<string, unknown> | null = null

vi.mock('node:tls', () => ({
  createSecureContext: vi.fn(() => ({})),
  connect: vi.fn((opts: Record<string, unknown>) => {
    capturedOpts = opts
    return new EventEmitter()
  })
}))

import { createTlsClient } from '../TlsBridge'

beforeEach(() => {
  capturedOpts = null
})

describe('createTlsClient tls.connect options', () => {
  test('checkServerIdentity bypasses hostname verification', () => {
    createTlsClient('CERT', 'KEY', vi.fn())
    expect(capturedOpts).not.toBeNull()
    const check = capturedOpts!.checkServerIdentity as Mock
    expect(check('host', {} as never)).toBeUndefined()
  })
})
