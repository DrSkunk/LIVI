import {
  navManeuverTypeToCode,
  navManeuverTypeToSide,
  turnEventToManeuverType,
  turnSideToNaviCode
} from '../navManeuverMap'

describe('turnEventToManeuverType', () => {
  test('returns undefined when event is missing', () => {
    expect(turnEventToManeuverType(undefined, undefined)).toBeUndefined()
    expect(turnEventToManeuverType(undefined, 'left')).toBeUndefined()
  })

  test.each([
    ['unknown', undefined, 0],
    ['depart', undefined, 11],
    ['name-change', undefined, 5],
    ['u-turn', undefined, 4],
    ['on-ramp', undefined, 9],
    ['merge', undefined, 9],
    ['roundabout-enter', undefined, 6],
    ['roundabout-exit', undefined, 7],
    ['roundabout-enter-and-exit', undefined, 6],
    ['straight', undefined, 3],
    ['ferry-boat', undefined, 15],
    ['ferry-train', undefined, 15]
  ])('event=%s side=%s → %s', (event, side, expected) => {
    expect(turnEventToManeuverType(event as never, side as never)).toBe(expected)
  })

  test('slight-turn picks right/left based on side', () => {
    expect(turnEventToManeuverType('slight-turn', 'right')).toBe(50)
    expect(turnEventToManeuverType('slight-turn', 'left')).toBe(49)
    expect(turnEventToManeuverType('slight-turn', 'unspecified')).toBe(49)
  })

  test('turn picks right/left based on side', () => {
    expect(turnEventToManeuverType('turn', 'right')).toBe(2)
    expect(turnEventToManeuverType('turn', 'left')).toBe(1)
    expect(turnEventToManeuverType('turn', 'unspecified')).toBe(1)
  })

  test('sharp-turn picks right/left based on side', () => {
    expect(turnEventToManeuverType('sharp-turn', 'right')).toBe(48)
    expect(turnEventToManeuverType('sharp-turn', 'left')).toBe(47)
  })

  test('off-ramp has three branches: right, left, none', () => {
    expect(turnEventToManeuverType('off-ramp', 'right')).toBe(23)
    expect(turnEventToManeuverType('off-ramp', 'left')).toBe(22)
    expect(turnEventToManeuverType('off-ramp', 'unspecified')).toBe(8)
  })

  test('fork picks right/left based on side', () => {
    expect(turnEventToManeuverType('fork', 'right')).toBe(14)
    expect(turnEventToManeuverType('fork', 'left')).toBe(13)
  })

  test('destination has three branches: right, left, none', () => {
    expect(turnEventToManeuverType('destination', 'right')).toBe(25)
    expect(turnEventToManeuverType('destination', 'left')).toBe(24)
    expect(turnEventToManeuverType('destination', 'unspecified')).toBe(12)
  })

  test('falls back to 0 for an unrecognized event string', () => {
    expect(turnEventToManeuverType('bogus' as never, undefined)).toBe(0)
  })
})

describe('turnSideToNaviCode', () => {
  test('right → 0, left → 1, unspecified → undefined', () => {
    expect(turnSideToNaviCode('right')).toBe(0)
    expect(turnSideToNaviCode('left')).toBe(1)
    expect(turnSideToNaviCode('unspecified')).toBeUndefined()
    expect(turnSideToNaviCode(undefined)).toBeUndefined()
  })
})

describe('navManeuverTypeToCode (modern enum)', () => {
  test.each([
    [0, 0], // UNKNOWN → noTurn
    [1, 11], // DEPART → proceedToRoute
    [2, 5], // NAME_CHANGE → followRoad
    [3, 13], // KEEP_LEFT
    [4, 14], // KEEP_RIGHT
    [5, 49], // TURN_SLIGHT_LEFT → slightLeft
    [6, 50], // TURN_SLIGHT_RIGHT → slightRight
    [7, 1], // TURN_NORMAL_LEFT → left
    [8, 2], // TURN_NORMAL_RIGHT → right
    [9, 47], // TURN_SHARP_LEFT → sharpLeft
    [10, 48], // TURN_SHARP_RIGHT → sharpRight
    [11, 4], // U_TURN_LEFT → uTurn
    [15, 9], // ON_RAMP_NORMAL_LEFT → rampOn
    [21, 22], // OFF_RAMP_SLIGHT_LEFT → rampOffLeft
    [22, 23], // OFF_RAMP_SLIGHT_RIGHT → rampOffRight
    [30, 6], // ROUNDABOUT_ENTER
    [36, 3], // STRAIGHT
    [39, 12], // DESTINATION → arrived
    [41, 24], // DESTINATION_LEFT → arrivedLeft
    [42, 25] // DESTINATION_RIGHT → arrivedRight
  ])('type %s → code %s', (type, expected) => {
    expect(navManeuverTypeToCode(type)).toBe(expected)
  })

  test('unknown type and undefined return undefined', () => {
    expect(navManeuverTypeToCode(999)).toBeUndefined()
    expect(navManeuverTypeToCode(undefined)).toBeUndefined()
  })

  test('covers every enum value 0..42', () => {
    const expected: Record<number, number | undefined> = {
      0: 0,
      1: 11,
      2: 5,
      3: 13,
      4: 14,
      5: 49,
      6: 50,
      7: 1,
      8: 2,
      9: 47,
      10: 48,
      11: 4,
      12: 4,
      13: 9,
      14: 9,
      15: 9,
      16: 9,
      17: 9,
      18: 9,
      19: 9,
      20: 9,
      21: 22,
      22: 23,
      23: 22,
      24: 23,
      25: 13,
      26: 14,
      27: 9,
      28: 9,
      29: 9,
      30: 6,
      31: 7,
      32: 6,
      33: 6,
      34: 6,
      35: 6,
      36: 3,
      37: 15,
      38: 15,
      39: 12,
      40: 12,
      41: 24,
      42: 25
    }
    for (let t = 0; t <= 42; t++) {
      expect(navManeuverTypeToCode(t)).toBe(expected[t])
    }
  })
})

describe('navManeuverTypeToSide (modern enum)', () => {
  test('left maneuvers → 1, right maneuvers → 0, others undefined', () => {
    expect(navManeuverTypeToSide(7)).toBe(1) // TURN_NORMAL_LEFT
    expect(navManeuverTypeToSide(8)).toBe(0) // TURN_NORMAL_RIGHT
    expect(navManeuverTypeToSide(41)).toBe(1) // DESTINATION_LEFT
    expect(navManeuverTypeToSide(42)).toBe(0) // DESTINATION_RIGHT
    expect(navManeuverTypeToSide(36)).toBeUndefined() // STRAIGHT
    expect(navManeuverTypeToSide(undefined)).toBeUndefined()
  })

  test('covers every enum value 0..42', () => {
    const left = new Set([3, 5, 7, 9, 11, 25, 41])
    const right = new Set([4, 6, 8, 10, 12, 26, 42])
    for (let t = 0; t <= 42; t++) {
      if (left.has(t)) expect(navManeuverTypeToSide(t)).toBe(1)
      else if (right.has(t)) expect(navManeuverTypeToSide(t)).toBe(0)
      else expect(navManeuverTypeToSide(t)).toBeUndefined()
    }
  })
})
