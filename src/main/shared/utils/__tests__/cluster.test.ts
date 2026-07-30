import { clusterTargetScreens, isClusterDisplayed, isClusterOnScreen } from '@main/shared/utils'

describe('cluster utils', () => {
  test('clusterTargetScreens collects roles enabled on dash3 or dash4', () => {
    expect(
      clusterTargetScreens({
        dashboards: { dash3: { main: true, dash: false }, dash4: { aux: true } }
      })
    ).toEqual(['main', 'aux'])
  })

  test('clusterTargetScreens returns empty list for missing config', () => {
    expect(clusterTargetScreens(null)).toEqual([])
    expect(clusterTargetScreens(undefined)).toEqual([])
    expect(clusterTargetScreens({ dashboards: null })).toEqual([])
  })

  test('isClusterOnScreen checks a single role', () => {
    const cfg = { dashboards: { dash3: { main: true, dash: false, aux: false } } }
    expect(isClusterOnScreen(cfg, 'main')).toBe(true)
    expect(isClusterOnScreen(cfg, 'dash')).toBe(false)
    expect(isClusterOnScreen(null, 'aux')).toBe(false)
  })

  test('isClusterDisplayed reflects whether any role is enabled', () => {
    expect(isClusterDisplayed({ dashboards: { dash4: { dash: true } } })).toBe(true)
    expect(isClusterDisplayed({ dashboards: { dash3: { main: false } } })).toBe(false)
  })
})
