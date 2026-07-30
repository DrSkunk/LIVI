import { decodeTlv8, encodeTlv8, type Tlv8Item } from '../tlv8'

describe('encodeTlv8', () => {
  test('encodes a short item as [type][len][value]', () => {
    const buf = encodeTlv8([{ type: 0x06, value: Buffer.from([0x01]) }])
    expect(buf.equals(Buffer.from([0x06, 0x01, 0x01]))).toBe(true)
  })

  test('encodes a zero-length value as [type][0]', () => {
    const buf = encodeTlv8([{ type: 0x0b, value: Buffer.alloc(0) }])
    expect(buf.equals(Buffer.from([0x0b, 0x00]))).toBe(true)
  })

  test('fragments values longer than 255 bytes into same-type items', () => {
    const value = Buffer.alloc(300, 0xab)
    const buf = encodeTlv8([{ type: 0x05, value }])
    expect(buf[0]).toBe(0x05)
    expect(buf[1]).toBe(255)
    expect(buf[2 + 255]).toBe(0x05)
    expect(buf[2 + 255 + 1]).toBe(45)
    expect(buf.length).toBe(2 + 255 + 2 + 45)
  })

  test('inserts a 0xff separator between adjacent items of the same type', () => {
    const items: Tlv8Item[] = [
      { type: 0x01, value: Buffer.from([0xaa]) },
      { type: 0x01, value: Buffer.from([0xbb]) }
    ]
    const buf = encodeTlv8(items)
    expect(buf.equals(Buffer.from([0x01, 0x01, 0xaa, 0xff, 0x00, 0x01, 0x01, 0xbb]))).toBe(true)
  })

  test('does not insert a separator between different types', () => {
    const buf = encodeTlv8([
      { type: 0x01, value: Buffer.from([0xaa]) },
      { type: 0x02, value: Buffer.from([0xbb]) }
    ])
    expect(buf.equals(Buffer.from([0x01, 0x01, 0xaa, 0x02, 0x01, 0xbb]))).toBe(true)
  })
})

describe('decodeTlv8', () => {
  test('decodes distinct items into a type-keyed map', () => {
    const map = decodeTlv8(Buffer.from([0x01, 0x02, 0xde, 0xad, 0x02, 0x01, 0x7f]))
    expect(map.get(0x01)?.equals(Buffer.from([0xde, 0xad]))).toBe(true)
    expect(map.get(0x02)?.equals(Buffer.from([0x7f]))).toBe(true)
  })

  test('merges consecutive same-type fragments after a full 255-byte item', () => {
    const value = Buffer.alloc(300, 0x11)
    const map = decodeTlv8(encodeTlv8([{ type: 0x05, value }]))
    expect(map.get(0x05)?.equals(value)).toBe(true)
  })

  test('replaces the value when a same-type item follows a non-full item', () => {
    const map = decodeTlv8(Buffer.from([0x03, 0x01, 0xaa, 0x03, 0x01, 0xbb]))
    expect(map.get(0x03)?.equals(Buffer.from([0xbb]))).toBe(true)
  })

  test('stops at a trailing partial header', () => {
    const map = decodeTlv8(Buffer.from([0x01, 0x01, 0xcc, 0x09]))
    expect(map.size).toBe(1)
    expect(map.get(0x01)?.equals(Buffer.from([0xcc]))).toBe(true)
  })

  test('returns an empty map for an empty buffer', () => {
    expect(decodeTlv8(Buffer.alloc(0)).size).toBe(0)
  })

  test('round-trips separator-delimited same-type items keeping the last value', () => {
    const map = decodeTlv8(
      encodeTlv8([
        { type: 0x01, value: Buffer.from([0xaa]) },
        { type: 0x01, value: Buffer.from([0xbb]) }
      ])
    )
    expect(map.get(0x01)?.equals(Buffer.from([0xbb]))).toBe(true)
    expect(map.get(0xff)?.length).toBe(0)
  })
})
