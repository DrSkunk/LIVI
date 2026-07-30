import { renderHook } from '@testing-library/react'
import type { Mock } from 'vitest'
import { useSmartSettings } from '../useSmartSettings'
import { useSmartSettingsFromSchema } from '../useSmartSettingsFromSchema'

const smartResult = {
  state: {},
  isDirty: false,
  needsRestart: false,
  handleFieldChange: vi.fn(),
  resetState: vi.fn(),
  restart: vi.fn(),
  requestRestart: vi.fn()
}

vi.mock('../useSmartSettings', () => ({
  useSmartSettings: vi.fn(() => smartResult)
}))

describe('useSmartSettingsFromSchema', () => {
  test('flattens schema state and forwards requestRestart', () => {
    const schema = {
      type: 'route',
      route: 'settings',
      path: '',
      label: 'Settings',
      children: [
        { type: 'number', path: 'video.width', label: 'Width' },
        { type: 'checkbox', path: 'audio.mute', label: 'Mute', transform: (v: unknown) => !!v },
        { type: 'select', path: 'wifi.type', label: 'Wifi', labelPath: 'wifi.label' },
        { type: 'string', path: '', label: 'Skipped' }
      ]
    } as any

    const settings = { video: { width: 800 }, audio: { mute: false } } as any
    const { result } = renderHook(() => useSmartSettingsFromSchema(schema, settings))

    result.current.requestRestart('video.width')
    expect(smartResult.requestRestart).toHaveBeenCalledWith('video.width')
    expect(result.current.state).toEqual({})
  })

  test('walks the schema with nullish settings without throwing', () => {
    const schema = {
      type: 'route',
      route: 'settings',
      path: '',
      label: 'Settings',
      children: [{ type: 'number', path: 'video.width', label: 'Width' }]
    } as any

    const { result } = renderHook(() => useSmartSettingsFromSchema(schema, null))
    expect(result.current.state).toEqual({})
  })

  test('requestRestart is a no-op when the inner hook exposes no requestRestart', () => {
    ;(useSmartSettings as unknown as Mock).mockReturnValueOnce({
      ...smartResult,
      requestRestart: undefined
    })

    const schema = {
      type: 'route',
      route: 'settings',
      path: '',
      label: 'Settings',
      children: [{ type: 'number', path: 'video.width', label: 'Width' }]
    } as any

    const { result } = renderHook(() => useSmartSettingsFromSchema(schema, {} as any))
    expect(() => result.current.requestRestart('video.width')).not.toThrow()
  })
})
