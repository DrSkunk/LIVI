import { getNodeByPath, getValueByPath, setValueByPath } from '../utils'

describe('settings utils', () => {
  test('getValueByPath returns nested value and undefined for missing paths', () => {
    const obj = { a: { b: { c: 7 } } }
    expect(getValueByPath(obj, 'a.b.c')).toBe(7)
    expect(getValueByPath(obj, 'a.b.x')).toBeUndefined()
    expect(getValueByPath(obj, '')).toBeUndefined()
  })

  test('setValueByPath creates nested records when needed', () => {
    const obj: Record<string, unknown> = {}
    setValueByPath(obj, 'ui.theme.primary', '#fff')
    expect(obj).toEqual({ ui: { theme: { primary: '#fff' } } })
  })

  test('setValueByPath is a no-op for an empty path', () => {
    const obj: Record<string, unknown> = { existing: 1 }
    setValueByPath(obj, '', 'ignored')
    expect(obj).toEqual({ existing: 1 })
  })

  test('getNodeByPath returns null when walking into a non-route node', () => {
    const leafRoot = { type: 'checkbox', path: 'mute', label: 'Mute' } as any
    expect(getNodeByPath(leafRoot, ['anything'])).toBeNull()
  })

  test('getNodeByPath resolves route chains and leaf nodes', () => {
    const tree = {
      type: 'route',
      route: 'settings',
      path: 'settings',
      label: 'Settings',
      children: [
        {
          type: 'route',
          route: 'audio',
          path: 'audio',
          label: 'Audio',
          children: [{ type: 'checkbox', path: 'mute', label: 'Mute' }]
        }
      ]
    } as any

    const leaf = getNodeByPath(tree, ['audio', 'mute'])
    expect(leaf && 'path' in leaf ? leaf.path : null).toBe('mute')

    const route = getNodeByPath(tree, ['audio'])
    expect(route?.type).toBe('route')

    expect(getNodeByPath(tree, ['video'])).toBeNull()
  })
})
