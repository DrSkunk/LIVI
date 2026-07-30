import type { PlistValue } from '../bplist'
import {
  type Contact,
  KNOB_HID_UID,
  knobHidDevice,
  knobReport,
  MEDIA_HID_UID,
  MediaButton,
  mediaHidDevice,
  mediaReport,
  TELEPHONY_HID_UID,
  TelephonyButton,
  TOUCH_CONTACTS,
  TOUCH_HID_UID,
  telephonyHidDevice,
  telephonyReport,
  touchHidDevice,
  touchReport
} from '../hid'

type Dict = { [key: string]: PlistValue }

describe('touchHidDevice', () => {
  test('declares the device entry with descriptor sized to the display', () => {
    const entry = touchHidDevice(800, 480, 'display-uuid') as Dict
    expect(entry.hidProductID).toBe(1)
    expect(entry.hidVendorID).toBe(2)
    expect(entry.hidCountryCode).toBe(0)
    expect(entry.uuid).toBe(TOUCH_HID_UID.toString(16))
    expect(entry.name).toBe('LIVI Touchscreen')
    expect(entry.displayUUID).toBe('display-uuid')
    const d = entry.hidDescriptor as Buffer
    expect(d.length).toBe(6 + 51 * TOUCH_CONTACTS + 1)
    expect(d[0]).toBe(0x05)
    expect(d[1]).toBe(0x0d)
    expect(d[d.length - 1]).toBe(0xc0)
  })

  test('encodes xMax and yMax little-endian in both finger collections', () => {
    const entry = touchHidDevice(0x0320, 0x01e0, 'u') as Dict
    const d = entry.hidDescriptor as Buffer
    for (const base of [6, 6 + 51]) {
      expect(d[base + 32]).toBe(0x26)
      expect(d[base + 33]).toBe(0x20)
      expect(d[base + 34]).toBe(0x03)
      expect(d[base + 43]).toBe(0x26)
      expect(d[base + 44]).toBe(0xe0)
      expect(d[base + 45]).toBe(0x01)
    }
  })

  test('encodes large axis maxima', () => {
    const entry = touchHidDevice(1920, 1080, 'u') as Dict
    const d = entry.hidDescriptor as Buffer
    expect(d[39]).toBe(1920 & 0xff)
    expect(d[40]).toBe(1920 >> 8)
    expect(d[50]).toBe(1080 & 0xff)
    expect(d[51]).toBe(1080 >> 8)
  })
})

describe('touchReport', () => {
  test('writes fixed transducer indices for empty contact list', () => {
    const r = touchReport([])
    expect(r.equals(Buffer.from([0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]))).toBe(true)
  })

  test('encodes a single down contact with rounded coordinates', () => {
    const r = touchReport([{ id: 0, x: 100.4, y: 200.6, down: true }])
    expect(r[0]).toBe(0)
    expect(r[1]).toBe(1)
    expect(r.readUInt16LE(2)).toBe(100)
    expect(r.readUInt16LE(4)).toBe(201)
    expect(r[6]).toBe(1)
    expect(r[7]).toBe(0)
  })

  test('encodes a lifted contact with touch bit clear', () => {
    const r = touchReport([{ id: 0, x: 10, y: 20, down: false }])
    expect(r[1]).toBe(0)
    expect(r.readUInt16LE(2)).toBe(10)
    expect(r.readUInt16LE(4)).toBe(20)
  })

  test('clamps negative coordinates to zero', () => {
    const r = touchReport([{ id: 0, x: -5, y: -0.9, down: true }])
    expect(r.readUInt16LE(2)).toBe(0)
    expect(r.readUInt16LE(4)).toBe(0)
  })

  test('encodes two contacts into their slots and ignores extras', () => {
    const contacts: Contact[] = [
      { id: 0, x: 1, y: 2, down: true },
      { id: 1, x: 3, y: 4, down: true },
      { id: 2, x: 5, y: 6, down: true }
    ]
    const r = touchReport(contacts)
    expect(r.length).toBe(12)
    expect(r.readUInt16LE(2)).toBe(1)
    expect(r.readUInt16LE(4)).toBe(2)
    expect(r[6]).toBe(1)
    expect(r[7]).toBe(1)
    expect(r.readUInt16LE(8)).toBe(3)
    expect(r.readUInt16LE(10)).toBe(4)
  })
})

describe('knobReport', () => {
  test('empty state produces an all-zero report', () => {
    expect(knobReport({}).equals(Buffer.from([0, 0, 0, 0]))).toBe(true)
  })

  test('sets the select, home and back bits individually', () => {
    expect(knobReport({ select: true })[0]).toBe(0x01)
    expect(knobReport({ home: true })[0]).toBe(0x02)
    expect(knobReport({ back: true })[0]).toBe(0x04)
    expect(knobReport({ select: true, home: true, back: true })[0]).toBe(0x07)
  })

  test('writes signed axes and wheel', () => {
    const r = knobReport({ x: 5, y: -5, wheel: 1 })
    expect(r.readInt8(1)).toBe(5)
    expect(r.readInt8(2)).toBe(-5)
    expect(r.readInt8(3)).toBe(1)
  })

  test('clamps axes to -127..127 and rounds fractions', () => {
    const r = knobReport({ x: -200, y: 200, wheel: 2.6 })
    expect(r.readInt8(1)).toBe(-127)
    expect(r.readInt8(2)).toBe(127)
    expect(r.readInt8(3)).toBe(3)
    expect(knobReport({ wheel: -2.6 }).readInt8(3)).toBe(-3)
    expect(knobReport({ x: 127.4 }).readInt8(1)).toBe(127)
    expect(knobReport({ x: -127.4 }).readInt8(1)).toBe(-127)
  })
})

describe('mediaReport and telephonyReport', () => {
  test('encodes media button indices', () => {
    expect(mediaReport(MediaButton.none).equals(Buffer.from([0]))).toBe(true)
    expect(mediaReport(MediaButton.playPause).equals(Buffer.from([3]))).toBe(true)
    expect(mediaReport(MediaButton.navGuidance).equals(Buffer.from([6]))).toBe(true)
  })

  test('encodes telephony button indices', () => {
    expect(telephonyReport(TelephonyButton.none).equals(Buffer.from([0]))).toBe(true)
    expect(telephonyReport(TelephonyButton.hookSwitch).equals(Buffer.from([1]))).toBe(true)
    expect(telephonyReport(TelephonyButton.del).equals(Buffer.from([17]))).toBe(true)
  })

  test('masks indices to one byte', () => {
    expect(mediaReport(0x1ff)[0]).toBe(0xff)
    expect(telephonyReport(0x102)[0]).toBe(0x02)
  })
})

describe('auxiliary hid devices', () => {
  test('knobHidDevice entry', () => {
    const entry = knobHidDevice('disp') as Dict
    expect(entry.uuid).toBe(KNOB_HID_UID.toString(16))
    expect(entry.name).toBe('LIVI Knob')
    expect(entry.displayUUID).toBe('disp')
    const d = entry.hidDescriptor as Buffer
    expect(d[0]).toBe(0x05)
    expect(d[1]).toBe(0x01)
    expect(d[d.length - 1]).toBe(0xc0)
  })

  test('mediaHidDevice entry', () => {
    const entry = mediaHidDevice('disp') as Dict
    expect(entry.uuid).toBe(MEDIA_HID_UID.toString(16))
    expect(entry.name).toBe('LIVI Media')
    const d = entry.hidDescriptor as Buffer
    expect(d[0]).toBe(0x05)
    expect(d[1]).toBe(0x0c)
  })

  test('telephonyHidDevice entry', () => {
    const entry = telephonyHidDevice('disp') as Dict
    expect(entry.uuid).toBe(TELEPHONY_HID_UID.toString(16))
    expect(entry.name).toBe('LIVI Telephony')
    expect(entry.hidProductID).toBe(1)
    const d = entry.hidDescriptor as Buffer
    expect(d[0]).toBe(0x05)
    expect(d[1]).toBe(0x0b)
  })
})
