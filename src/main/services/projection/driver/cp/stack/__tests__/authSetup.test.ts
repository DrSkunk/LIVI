import { handleAuthSetup } from '../authSetup'
import { aesCtr128, sha1, sha256, x25519Generate, x25519Shared } from '../crypto'
import type { MfiSigner } from '../mfiSigner'

vi.mock('../crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../crypto')>()
  return { ...actual, x25519Shared: vi.fn(actual.x25519Shared) }
})

const CERT = Buffer.from('mfi-certificate')
const SIG = Buffer.alloc(64, 0xab)

function makeSigner(major: number): MfiSigner & { sign: ReturnType<typeof vi.fn> } {
  return {
    certificate: vi.fn(async () => CERT),
    sign: vi.fn(async () => SIG),
    protocolMajor: vi.fn(async () => major)
  }
}

function parseResponse(res: Buffer): { pub: Buffer; cert: Buffer; encSig: Buffer } {
  const pub = res.subarray(0, 32)
  const certLen = res.readUInt32BE(32)
  const cert = res.subarray(36, 36 + certLen)
  const sigLen = res.readUInt32BE(36 + certLen)
  const encSig = res.subarray(40 + certLen, 40 + certLen + sigLen)
  return { pub, cert, encSig }
}

let logSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  logSpy.mockRestore()
  warnSpy.mockRestore()
})

describe('handleAuthSetup', () => {
  test('answers a 3.0 chip request with pub, cert and an encrypted sha256 signature', async () => {
    const phone = x25519Generate()
    const signer = makeSigner(3)
    const res = await handleAuthSetup(Buffer.concat([Buffer.from([1]), phone.pubRaw]), signer)
    expect(res).not.toBeNull()
    const { pub, cert, encSig } = parseResponse(res as Buffer)
    expect(cert.equals(CERT)).toBe(true)
    expect(signer.sign).toHaveBeenCalledWith(sha256(pub, phone.pubRaw))
    const shared = x25519Shared(phone.priv, pub)
    const aesKey = sha1(Buffer.from('AES-KEY'), shared).subarray(0, 16)
    const aesIv = sha1(Buffer.from('AES-IV'), shared).subarray(0, 16)
    expect(aesCtr128(aesKey, aesIv, encSig).equals(SIG)).toBe(true)
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('sha256'))
  })

  test('signs a sha1 digest for a 2.0C chip', async () => {
    const phone = x25519Generate()
    const signer = makeSigner(2)
    const res = await handleAuthSetup(Buffer.concat([Buffer.from([1]), phone.pubRaw]), signer)
    const { pub } = parseResponse(res as Buffer)
    expect(signer.sign).toHaveBeenCalledWith(sha1(pub, phone.pubRaw))
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('sha1'))
  })

  test('rejects a body with the wrong length', async () => {
    const res = await handleAuthSetup(Buffer.alloc(32), makeSigner(3))
    expect(res).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('bad request'))
  })

  test('rejects an unknown version byte', async () => {
    const body = Buffer.concat([Buffer.from([2]), Buffer.alloc(32, 1)])
    expect(await handleAuthSetup(body, makeSigner(3))).toBeNull()
  })

  test('rejects an all-zero shared secret', async () => {
    vi.mocked(x25519Shared).mockReturnValueOnce(Buffer.alloc(32))
    const phone = x25519Generate()
    const res = await handleAuthSetup(
      Buffer.concat([Buffer.from([1]), phone.pubRaw]),
      makeSigner(3)
    )
    expect(res).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith('[authSetup] invalid shared secret')
  })
})
