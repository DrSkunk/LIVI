import { encodeNmea } from '../nmea'

describe('encodeNmea hdop', () => {
  test('derives the hdop from the horizontal accuracy', () => {
    const nmea = encodeNmea(52.5, 13.4, 30, 90, 5, 1_700_000_000_000, 10)
    expect(nmea).toContain(',2.0,')
  })

  test('clamps the hdop into 0.5..50', () => {
    expect(encodeNmea(52.5, 13.4, 0, 0, 0, undefined, 1)).toContain(',0.5,')
    expect(encodeNmea(52.5, 13.4, 0, 0, 0, undefined, 10000)).toContain(',50.0,')
  })

  test('falls back to hdop 1.0 for zero or missing accuracy', () => {
    expect(encodeNmea(52.5, 13.4, 0, 0, 0, undefined, 0)).toContain(',1.0,')
    expect(encodeNmea(52.5, 13.4, 0, 0, 0, undefined, undefined)).toContain(',1.0,')
  })
})
