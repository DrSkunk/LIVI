import { InputCommand, isInputCommand } from '@main/shared/types/InputCommand'

describe('isInputCommand', () => {
  test('accepts every enum value', () => {
    for (const value of Object.values(InputCommand)) {
      expect(isInputCommand(value)).toBe(true)
    }
  })

  test('rejects unknown strings', () => {
    expect(isInputCommand('turboBoost')).toBe(false)
    expect(isInputCommand('')).toBe(false)
  })

  test('rejects non-string values', () => {
    expect(isInputCommand(42)).toBe(false)
    expect(isInputCommand(null)).toBe(false)
    expect(isInputCommand(undefined)).toBe(false)
    expect(isInputCommand({})).toBe(false)
  })
})
