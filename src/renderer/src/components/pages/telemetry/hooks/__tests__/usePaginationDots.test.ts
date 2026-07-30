import { act, renderHook } from '@testing-library/react'
import { usePaginationDots } from '../usePaginationDots'

describe('usePaginationDots', () => {
  test('dots follow the navbar: shown when the nav is shown, hidden when it hides', () => {
    const visibleNav = renderHook(() => usePaginationDots(false))
    expect(visibleNav.result.current.showDots).toBe(true)

    const hiddenNav = renderHook(() => usePaginationDots(true))
    expect(hiddenNav.result.current.showDots).toBe(false)
  })

  test('always shows dots when no navbar is present', () => {
    const shownHidden = renderHook(() => usePaginationDots(true, false))
    expect(shownHidden.result.current.showDots).toBe(true)

    const shownVisible = renderHook(() => usePaginationDots(false, false))
    expect(shownVisible.result.current.showDots).toBe(true)
  })

  test('revealDots is a no-op (kept for caller API compatibility)', () => {
    const { result } = renderHook(() => usePaginationDots(false))
    act(() => {
      result.current.revealDots()
    })
    expect(result.current.showDots).toBe(true)
  })
})
