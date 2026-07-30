import { configToCodecData } from '../nalu'

function avcCRecord(): Buffer {
  return Buffer.from([0x01, 0x64, 0x00, 0x28, 0xff, 0xe1, 0x00, 0x04, 0x67, 0x64, 0x00, 0x28])
}

function box(fourcc: string, record: Buffer): Buffer {
  const size = Buffer.alloc(4)
  size.writeUInt32BE(8 + record.length, 0)
  return Buffer.concat([size, Buffer.from(fourcc, 'ascii'), record])
}

describe('configToCodecData', () => {
  test('extracts the record after an avcC fourcc as h264', () => {
    const record = avcCRecord()
    const { codec, codecData } = configToCodecData(box('avcC', record))
    expect(codec).toBe('h264')
    expect(codecData.equals(record)).toBe(true)
  })

  test('extracts the record after an hvcC fourcc as h265', () => {
    const record = Buffer.from([0x01, 0x02, 0x03, 0x04])
    const { codec, codecData } = configToCodecData(box('hvcC', record))
    expect(codec).toBe('h265')
    expect(codecData.equals(record)).toBe(true)
  })

  test('finds the fourcc nested inside a sample entry', () => {
    const record = avcCRecord()
    const entry = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x30]),
      Buffer.from('avc1', 'ascii'),
      Buffer.alloc(6),
      box('avcC', record)
    ])
    const { codec, codecData } = configToCodecData(entry)
    expect(codec).toBe('h264')
    expect(codecData.equals(record)).toBe(true)
  })

  test('detects a bare avcC record as h264', () => {
    const payload = avcCRecord()
    const { codec, codecData } = configToCodecData(payload)
    expect(codec).toBe('h264')
    expect(codecData).toBe(payload)
  })

  test('falls back to h265 for a payload shorter than 9 bytes', () => {
    const payload = Buffer.from([0x01, 0x02, 0x03])
    const { codec, codecData } = configToCodecData(payload)
    expect(codec).toBe('h265')
    expect(codecData).toBe(payload)
  })

  test('falls back to h265 when the SPS count is zero', () => {
    const payload = Buffer.from([0x01, 0x64, 0x00, 0x28, 0xff, 0xe0, 0x00, 0x04, 0x67, 0x64])
    expect(configToCodecData(payload).codec).toBe('h265')
  })

  test('falls back to h265 when the SPS length exceeds the payload', () => {
    const payload = Buffer.from([0x01, 0x64, 0x00, 0x28, 0xff, 0xe1, 0x00, 0xff, 0x67, 0x64])
    expect(configToCodecData(payload).codec).toBe('h265')
  })

  test('falls back to h265 when the first NAL unit is not an SPS', () => {
    const payload = Buffer.from([0x01, 0x64, 0x00, 0x28, 0xff, 0xe1, 0x00, 0x04, 0x68, 0x64])
    expect(configToCodecData(payload).codec).toBe('h265')
  })
})
