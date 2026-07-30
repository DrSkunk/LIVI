import type { ProtoTypes } from '../../proto/index'
import type { SessionConfig } from '../Session'

const ORIG_DEBUG = process.env.DEBUG

type BuilderModule = typeof import('../ServiceDiscoveryBuilder')
let buildServiceDiscoveryResponse: BuilderModule['buildServiceDiscoveryResponse']

beforeAll(async () => {
  process.env.DEBUG = '1'
  vi.resetModules()
  ;({ buildServiceDiscoveryResponse } = await import('../ServiceDiscoveryBuilder'))
})

afterAll(() => {
  if (ORIG_DEBUG === undefined) delete process.env.DEBUG
  else process.env.DEBUG = ORIG_DEBUG
  vi.resetModules()
})

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

function stubProto(byteLen: number): ProtoTypes {
  return {
    ServiceDiscoveryResponse: {
      create: (fields: Record<string, unknown>) => fields,
      encode: () => ({ finish: () => new Uint8Array(byteLen).fill(0xab) })
    }
  } as unknown as ProtoTypes
}

function baseConfig(over: Partial<SessionConfig> = {}): SessionConfig {
  return {
    huName: 'LIVI',
    videoWidth: 1280,
    videoHeight: 720,
    videoDpi: 140,
    videoFps: 30,
    clusterEnabled: false,
    clusterWidth: 0,
    clusterHeight: 0,
    clusterFps: 0,
    clusterDpi: 0,
    ...over
  }
}

describe('buildServiceDiscoveryResponse under DEBUG', () => {
  test('logs advertised codecs and a short SDR hex dump', () => {
    buildServiceDiscoveryResponse(baseConfig({ hevcSupported: true }), stubProto(4))
    expect(console.log).toHaveBeenCalled()
  })

  test('truncates the SDR hex dump when the buffer exceeds 64 bytes', () => {
    buildServiceDiscoveryResponse(baseConfig(), stubProto(128))
    expect(console.log).toHaveBeenCalled()
  })
})
