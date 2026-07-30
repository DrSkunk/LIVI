import { circleBtnStyle } from '../styles'

describe('circleBtnStyle', () => {
  const ringColor = '#00aaff'

  test('returns base background and no shadow when idle', () => {
    const style = circleBtnStyle(40, { ringColor })

    expect(style.background).toBe('rgba(255,255,255,0.16)')
    expect(style.boxShadow).toBe('none')
    expect(style.transform).toBe('scale(1)')
    expect(style.width).toBe(40)
    expect(style.height).toBe(40)
  })

  test('applies focused ring shadow and active background', () => {
    const style = circleBtnStyle(40, { ringColor, focused: true })

    expect(style.background).toBe('rgba(255,255,255,0.24)')
    expect(style.boxShadow).toBe(`0 0 0 3px ${ringColor}`)
  })

  test('applies pressed inset shadow and scale', () => {
    const style = circleBtnStyle(40, { ringColor, pressed: true })

    expect(style.boxShadow).toBe(`0 0 0 4px ${ringColor} inset`)
    expect(style.transform).toBe('scale(0.94)')
  })

  test('applies hovered ring shadow', () => {
    const style = circleBtnStyle(40, { ringColor, hovered: true })

    expect(style.boxShadow).toBe(`0 0 0 2px ${ringColor}`)
    expect(style.background).toBe('rgba(255,255,255,0.24)')
  })
})
