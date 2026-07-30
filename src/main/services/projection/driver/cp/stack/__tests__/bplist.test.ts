import { decodeBplist, encodeBplist, type PlistValue } from '../bplist'

function singleObjectPlist(body: Buffer): Buffer {
  const trailer = Buffer.alloc(32)
  trailer.writeUInt8(1, 6)
  trailer.writeUInt8(1, 7)
  trailer.writeBigUInt64BE(1n, 8)
  trailer.writeBigUInt64BE(0n, 16)
  trailer.writeBigUInt64BE(BigInt(8 + body.length), 24)
  return Buffer.concat([Buffer.from('bplist00', 'ascii'), body, Buffer.from([8]), trailer])
}

function roundtrip(value: PlistValue): PlistValue {
  return decodeBplist(encodeBplist(value))
}

describe('encodeBplist/decodeBplist roundtrips', () => {
  test('booleans', () => {
    expect(roundtrip(true)).toBe(true)
    expect(roundtrip(false)).toBe(false)
  })

  test('integers across encoded widths', () => {
    for (const n of [0, 1, 0xff, 0x100, 0xffff, 0x10000, 0xffffffff]) {
      expect(roundtrip(n)).toBe(n)
    }
  })

  test('integer above 32 bits encodes as 8 bytes and decodes as number', () => {
    expect(roundtrip(0x100000000)).toBe(0x100000000)
    const buf = encodeBplist(0x100000000)
    expect(buf[8]).toBe(0x13)
  })

  test('small bigint decodes as number', () => {
    expect(roundtrip(7n)).toBe(7)
  })

  test('bigint above MAX_SAFE_INTEGER stays bigint', () => {
    const big = (1n << 60n) + 3n
    expect(roundtrip(big)).toBe(big)
  })

  test('doubles for fractional and negative numbers', () => {
    expect(roundtrip(1.5)).toBe(1.5)
    expect(roundtrip(Math.PI)).toBe(Math.PI)
    expect(roundtrip(-3)).toBe(-3)
  })

  test('ascii strings including count boundaries', () => {
    expect(roundtrip('')).toBe('')
    expect(roundtrip('hello')).toBe('hello')
    const at15 = 'a'.repeat(15)
    expect(roundtrip(at15)).toBe(at15)
    const long = 'b'.repeat(300)
    expect(roundtrip(long)).toBe(long)
  })

  test('unicode strings use utf16be', () => {
    expect(roundtrip('héllo ✓')).toBe('héllo ✓')
    const encoded = encodeBplist('é')
    expect(encoded[8]).toBe(0x61)
    expect(encoded[9]).toBe(0x00)
    expect(encoded[10]).toBe(0xe9)
  })

  test('data buffers', () => {
    const data = Buffer.from([1, 2, 3, 0xff])
    expect((roundtrip(data) as Buffer).equals(data)).toBe(true)
  })

  test('data buffer above 65535 bytes forces 4-byte counts and offsets', () => {
    const data = Buffer.alloc(70000, 0xab)
    expect((roundtrip(data) as Buffer).equals(data)).toBe(true)
  })

  test('arrays and nested dicts', () => {
    const value: PlistValue = {
      name: 'LIVI',
      flag: true,
      nested: { list: [1, 'two', Buffer.from([3])] },
      empty: [],
      emptyDict: {}
    }
    const out = roundtrip(value) as { [k: string]: PlistValue }
    expect(out.name).toBe('LIVI')
    expect(out.flag).toBe(true)
    const nested = out.nested as { [k: string]: PlistValue }
    const list = nested.list as PlistValue[]
    expect(list[0]).toBe(1)
    expect(list[1]).toBe('two')
    expect((list[2] as Buffer).equals(Buffer.from([3]))).toBe(true)
    expect(out.empty).toEqual([])
    expect(out.emptyDict).toEqual({})
  })

  test('array with more than 255 objects uses 2-byte refs', () => {
    const arr = Array.from({ length: 300 }, (_, i) => i % 7)
    expect(roundtrip(arr)).toEqual(arr)
  })

  test('array with more than 65535 objects uses 4-byte refs', () => {
    const arr = Array.from({ length: 65600 }, () => 1)
    const out = roundtrip(arr) as PlistValue[]
    expect(out.length).toBe(65600)
    expect(out[0]).toBe(1)
    expect(out[65599]).toBe(1)
  })
})

describe('decodeBplist errors and manual objects', () => {
  test('rejects buffers that are too short', () => {
    expect(() => decodeBplist(Buffer.alloc(10))).toThrow('bad magic or too short')
  })

  test('rejects wrong magic', () => {
    expect(() => decodeBplist(Buffer.alloc(64))).toThrow('bad magic or too short')
  })

  test('rejects unsupported primitives', () => {
    expect(() => decodeBplist(singleObjectPlist(Buffer.from([0x00])))).toThrow(
      'unsupported primitive'
    )
  })

  test('rejects unsupported object types', () => {
    expect(() =>
      decodeBplist(singleObjectPlist(Buffer.from([0x33, 0, 0, 0, 0, 0, 0, 0, 0])))
    ).toThrow('unsupported object type 0x3')
  })

  test('decodes 4-byte floats', () => {
    const body = Buffer.alloc(5)
    body.writeUInt8(0x22, 0)
    body.writeFloatBE(2.5, 1)
    expect(decodeBplist(singleObjectPlist(body))).toBe(2.5)
  })

  test('rejects unsupported real sizes', () => {
    expect(() => decodeBplist(singleObjectPlist(Buffer.from([0x21, 0, 0])))).toThrow(
      'unsupported real size'
    )
  })
})
