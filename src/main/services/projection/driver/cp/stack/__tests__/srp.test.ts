import { createHash, randomBytes } from 'node:crypto'
import { type SrpServer, srpStartServer } from '../srp'

const N_HEX = `
FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E088A67CC74
020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B302B0A6DF25F1437
4FE1356D6D51C245E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED
EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3DC2007CB8A163BF05
98DA48361C55D39A69163FA8FD24CF5F83655D23DCA3AD961C62F356208552BB
9ED529077096966D670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B
E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF6955817183
995497CEA956AE515D2261898FA051015728E5A8AAAC42DAD33170D04507A33A
85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7AB
F5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6BF12FFA06D98A0864D8
7602733EC86A64521F2B18177B200CBBE117577A615D6C770988C0BAD946E208
E24FA074E5AB3143DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF
`.replace(/\s+/g, '')

const N = BigInt(`0x${N_HEX}`)
const g = 5n
const N_BYTES = 384

function sha512(...parts: Buffer[]): Buffer {
  const h = createHash('sha512')
  for (const p of parts) h.update(p)
  return h.digest()
}

function toBuf(n: bigint): Buffer {
  let hex = n.toString(16)
  if (hex.length % 2) hex = `0${hex}`
  return Buffer.from(hex, 'hex')
}

function pad(n: bigint): Buffer {
  const b = toBuf(n)
  if (b.length >= N_BYTES) return b
  return Buffer.concat([Buffer.alloc(N_BYTES - b.length), b])
}

function toBigInt(b: Buffer): bigint {
  return b.length === 0 ? 0n : BigInt(`0x${b.toString('hex')}`)
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n
  let b = base % mod
  let e = exp
  while (e > 0n) {
    if (e & 1n) result = (result * b) % mod
    e >>= 1n
    b = (b * b) % mod
  }
  return result
}

function runClient(
  server: SrpServer,
  username: string,
  password: string
): { A: Buffer; M1: Buffer; K: Buffer } {
  let a = 0n
  let A = 0n
  do {
    a = toBigInt(randomBytes(32))
    A = modPow(g, a, N)
  } while (toBuf(A).length !== N_BYTES)

  const B = toBigInt(server.B)
  const u = toBigInt(sha512(pad(A), pad(B)))
  const k = toBigInt(sha512(toBuf(N), pad(g)))
  const I = Buffer.from(username, 'utf8')
  const p = Buffer.from(password, 'utf8')
  const x = toBigInt(sha512(server.salt, sha512(I, Buffer.from(':'), p)))
  const kgx = (k * modPow(g, x, N)) % N
  const base = (((B - kgx) % N) + N) % N
  const S = modPow(base, a + u * x, N)
  const K = sha512(toBuf(S))
  const hN = sha512(toBuf(N))
  const hg = sha512(toBuf(g))
  const hXor = Buffer.alloc(hN.length)
  for (let i = 0; i < hN.length; i++) hXor[i] = hN[i] ^ hg[i]
  const M1 = sha512(hXor, sha512(I), server.salt, pad(A), pad(B), K)
  return { A: pad(A), M1, K }
}

describe('srpStartServer', () => {
  test('exposes a 16-byte salt and a 384-byte public key B', () => {
    const server = srpStartServer('Pair-Setup', '3939')
    expect(server.salt.length).toBe(16)
    expect(server.B.length).toBe(384)
  })

  test('completes a full SRP-6a exchange with a correct client', () => {
    const server = srpStartServer('Pair-Setup', '817-24-609')
    const client = runClient(server, 'Pair-Setup', '817-24-609')
    const result = server.verify(client.A, client.M1)
    expect(result.ok).toBe(true)
    expect(result.K?.equals(client.K)).toBe(true)
    const expectedM2 = sha512(client.A, client.M1, result.K as Buffer)
    expect(result.serverM2?.equals(expectedM2)).toBe(true)
  })

  test('rejects a client using the wrong password', () => {
    const server = srpStartServer('Pair-Setup', '1111')
    const client = runClient(server, 'Pair-Setup', '2222')
    const result = server.verify(client.A, client.M1)
    expect(result.ok).toBe(false)
    expect(result.K).toBeUndefined()
    expect(result.serverM2).toBeUndefined()
  })

  test('rejects a wrong M1 proof', () => {
    const server = srpStartServer('Pair-Setup', '3939')
    const client = runClient(server, 'Pair-Setup', '3939')
    const result = server.verify(client.A, Buffer.alloc(64))
    expect(result.ok).toBe(false)
  })

  test('rejects A congruent to 0 mod N', () => {
    const server = srpStartServer('Pair-Setup', '3939')
    expect(server.verify(toBuf(N), Buffer.alloc(64)).ok).toBe(false)
    expect(server.verify(toBuf(2n * N), Buffer.alloc(64)).ok).toBe(false)
  })

  test('rejects an empty A buffer', () => {
    const server = srpStartServer('Pair-Setup', '3939')
    const result = server.verify(Buffer.alloc(0), Buffer.alloc(64))
    expect(result.ok).toBe(false)
  })
})
