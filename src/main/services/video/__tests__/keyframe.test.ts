import { classifyNal } from '../keyframe'

describe('classifyNal — non-NAL codecs', () => {
  test('vp9 and av1 frames always count as keyframes', () => {
    expect(classifyNal(Buffer.from([0x00]), 'vp9', false)).toBe('keyframe')
    expect(classifyNal(Buffer.from([0x00]), 'av1', true)).toBe('keyframe')
  })
})

describe('classifyNal — h264 Annex-B', () => {
  test('IDR slice after a 3-byte start code is a keyframe', () => {
    expect(classifyNal(Buffer.from([0, 0, 1, 0x65]), 'h264', false)).toBe('keyframe')
  })

  test('non-IDR slice after a 4-byte start code is a delta', () => {
    expect(classifyNal(Buffer.from([0, 0, 0, 1, 0x41]), 'h264', false)).toBe('delta')
  })

  test('SPS and PPS only classify as params', () => {
    expect(classifyNal(Buffer.from([0, 0, 1, 0x67, 0, 0, 1, 0x68]), 'h264', false)).toBe('params')
  })

  test('params followed by an IDR upgrade to keyframe', () => {
    expect(classifyNal(Buffer.from([0, 0, 1, 0x67, 0, 0, 1, 0x65]), 'h264', false)).toBe('keyframe')
  })

  test('a trailing delta slice does not downgrade a keyframe', () => {
    expect(classifyNal(Buffer.from([0, 0, 1, 0x65, 0, 0, 1, 0x41]), 'h264', false)).toBe('keyframe')
  })

  test('an unknown NAL type is ignored', () => {
    expect(classifyNal(Buffer.from([0, 0, 1, 0x1f]), 'h264', false)).toBe('delta')
  })

  test('a frame without start codes falls back to delta', () => {
    expect(classifyNal(Buffer.from([9, 8, 7, 6, 5]), 'h264', false)).toBe('delta')
    expect(classifyNal(Buffer.from([0, 0, 0, 1]), 'h264', false)).toBe('delta')
  })

  test('near-miss byte patterns are skipped', () => {
    expect(classifyNal(Buffer.from([0, 0, 2, 9, 9]), 'h264', false)).toBe('delta')
    expect(classifyNal(Buffer.from([0, 5, 0, 0, 1, 0x65]), 'h264', false)).toBe('keyframe')
    expect(classifyNal(Buffer.from([9, 0, 0, 0, 1]), 'h264', false)).toBe('delta')
    expect(classifyNal(Buffer.from([0, 0, 0, 0, 1, 0x65]), 'h264', false)).toBe('keyframe')
    expect(classifyNal(Buffer.from([0, 0, 0, 2, 0x65, 0]), 'h264', false)).toBe('delta')
  })
})

describe('classifyNal — h265 Annex-B', () => {
  test('IRAP NAL types are keyframes', () => {
    expect(classifyNal(Buffer.from([0, 0, 1, 19 << 1]), 'h265', false)).toBe('keyframe')
  })

  test('VPS/SPS/PPS are params', () => {
    expect(classifyNal(Buffer.from([0, 0, 1, 32 << 1]), 'h265', false)).toBe('params')
  })

  test('trailing slices are deltas', () => {
    expect(classifyNal(Buffer.from([0, 0, 1, 1 << 1]), 'h265', false)).toBe('delta')
    expect(classifyNal(Buffer.from([0, 0, 1, 24 << 1]), 'h265', false)).toBe('delta')
  })

  test('reserved NAL types are ignored', () => {
    expect(classifyNal(Buffer.from([0, 0, 1, 35 << 1]), 'h265', false)).toBe('delta')
  })
})

describe('classifyNal — length-prefixed', () => {
  test('reads each length-prefixed NAL and ranks them', () => {
    const frame = Buffer.from([0, 0, 0, 1, 0x67, 0, 0, 0, 1, 0x65])
    expect(classifyNal(frame, 'h264', true)).toBe('keyframe')
  })

  test('a zero length stops the scan', () => {
    expect(classifyNal(Buffer.from([0, 0, 0, 0]), 'h264', true)).toBe('delta')
  })

  test('a length past the buffer end stops the scan', () => {
    expect(classifyNal(Buffer.from([0, 0, 0, 9, 0x65]), 'h264', true)).toBe('delta')
  })

  test('a single fitting NAL classifies normally', () => {
    expect(classifyNal(Buffer.from([0, 0, 0, 2, 0x65, 0]), 'h264', true)).toBe('keyframe')
  })
})
