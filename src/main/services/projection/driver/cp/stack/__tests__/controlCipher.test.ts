import { ControlCipher } from '../controlCipher'

const KEY_A = Buffer.alloc(32, 0xaa)
const KEY_B = Buffer.alloc(32, 0xbb)

function pair(): { phone: ControlCipher; accessory: ControlCipher } {
  return {
    phone: new ControlCipher(KEY_A, KEY_B),
    accessory: new ControlCipher(KEY_B, KEY_A)
  }
}

describe('ControlCipher', () => {
  test('encrypt/decrypt round trip for a single frame', () => {
    const { phone, accessory } = pair()
    const wire = phone.encrypt(Buffer.from('RTSP/1.0 200 OK'))
    const { data, rest } = accessory.decrypt(wire)
    expect(data.toString()).toBe('RTSP/1.0 200 OK')
    expect(rest.length).toBe(0)
  })

  test('frames carry a little-endian ciphertext length header', () => {
    const { phone } = pair()
    const wire = phone.encrypt(Buffer.from('abc'))
    expect(wire.readUInt16LE(0)).toBe(3)
    expect(wire.length).toBe(2 + 3 + 16)
  })

  test('splits plaintexts larger than 16 KiB into multiple frames', () => {
    const { phone, accessory } = pair()
    const plain = Buffer.alloc(0x4000 + 100, 0x5a)
    const wire = phone.encrypt(plain)
    expect(wire.readUInt16LE(0)).toBe(0x4000)
    expect(wire.length).toBe(2 + 0x4000 + 16 + 2 + 100 + 16)
    const { data, rest } = accessory.decrypt(wire)
    expect(data.equals(plain)).toBe(true)
    expect(rest.length).toBe(0)
  })

  test('keeps per-direction counters so sequential frames decrypt', () => {
    const { phone, accessory } = pair()
    const first = phone.encrypt(Buffer.from('one'))
    const second = phone.encrypt(Buffer.from('two'))
    expect(accessory.decrypt(first).data.toString()).toBe('one')
    expect(accessory.decrypt(second).data.toString()).toBe('two')
  })

  test('decrypts both directions independently', () => {
    const { phone, accessory } = pair()
    const toAccessory = phone.encrypt(Buffer.from('ping'))
    const toPhone = accessory.encrypt(Buffer.from('pong'))
    expect(accessory.decrypt(toAccessory).data.toString()).toBe('ping')
    expect(phone.decrypt(toPhone).data.toString()).toBe('pong')
  })

  test('returns a partial frame untouched as rest', () => {
    const { phone, accessory } = pair()
    const wire = phone.encrypt(Buffer.from('later'))
    const cut = wire.subarray(0, wire.length - 3)
    const { data, rest } = accessory.decrypt(cut)
    expect(data.length).toBe(0)
    expect(rest.equals(cut)).toBe(true)
    const complete = accessory.decrypt(Buffer.concat([rest, wire.subarray(wire.length - 3)]))
    expect(complete.data.toString()).toBe('later')
  })

  test('returns a lone length byte as rest', () => {
    const { accessory } = pair()
    const { data, rest } = accessory.decrypt(Buffer.from([0x05]))
    expect(data.length).toBe(0)
    expect(rest.equals(Buffer.from([0x05]))).toBe(true)
  })

  test('decrypts two frames from one buffer', () => {
    const { phone, accessory } = pair()
    const wire = Buffer.concat([phone.encrypt(Buffer.from('a')), phone.encrypt(Buffer.from('b'))])
    const { data, rest } = accessory.decrypt(wire)
    expect(data.toString()).toBe('ab')
    expect(rest.length).toBe(0)
  })

  test('throws when the key is wrong', () => {
    const { phone } = pair()
    const wrong = new ControlCipher(Buffer.alloc(32, 0xcc), KEY_A)
    expect(() => wrong.decrypt(phone.encrypt(Buffer.from('x')))).toThrow()
  })
})
