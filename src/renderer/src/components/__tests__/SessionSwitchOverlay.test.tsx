import { act, render } from '@testing-library/react'
import SessionSwitchOverlay from '../SessionSwitchOverlay'

type Handler = (evt: unknown, ...args: unknown[]) => void

function installBridge(onEvent?: (h: Handler) => unknown): { handlers: Handler[] } {
  const handlers: Handler[] = []
  const fn =
    onEvent ??
    ((h: Handler) => {
      handlers.push(h)
      return () => {
        const i = handlers.indexOf(h)
        if (i >= 0) handlers.splice(i, 1)
      }
    })
  ;(window as unknown as { projection: unknown }).projection = { ipc: { onEvent: fn } }
  return { handlers }
}

afterEach(() => {
  delete (window as unknown as { projection?: unknown }).projection
})

describe('SessionSwitchOverlay', () => {
  test('renders nothing until a valid session event arrives', () => {
    const { handlers } = installBridge()
    const { container } = render(<SessionSwitchOverlay />)
    expect(container).toBeEmptyDOMElement()

    act(() => handlers[0](null, { type: 'session', position: 2, total: 3 }))
    expect(container.textContent).toContain('2')
    expect(container.textContent).toContain('3')
  })

  test('ignores non-session events, missing positions and position < 1', () => {
    const { handlers } = installBridge()
    const { container } = render(<SessionSwitchOverlay />)

    act(() => handlers[0](null, { type: 'other', position: 2, total: 3 }))
    act(() => handlers[0](null, { type: 'session', position: 0, total: 3 }))
    act(() => handlers[0](null, {}))
    expect(container).toBeEmptyDOMElement()
  })

  test('defaults total to zero when omitted', () => {
    const { handlers } = installBridge()
    const { container } = render(<SessionSwitchOverlay />)
    act(() => handlers[0](null, { type: 'session', position: 1 }))
    expect(container.textContent).toContain('1')
    expect(container.textContent).toContain('/0')
  })

  test('coerces non-numeric position/total to zero and ignores empty event args', () => {
    const { handlers } = installBridge()
    const { container } = render(<SessionSwitchOverlay />)
    act(() => handlers[0](null))
    act(() => handlers[0](null, { type: 'session', position: 'x', total: 'y' }))
    expect(container).toBeEmptyDOMElement()
  })

  test('unsubscribes on unmount', () => {
    const unsubscribe = vi.fn()
    installBridge(() => unsubscribe)
    const { unmount } = render(<SessionSwitchOverlay />)
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  test('tolerates an onEvent that returns no unsubscribe function', () => {
    installBridge(() => undefined)
    const { unmount } = render(<SessionSwitchOverlay />)
    expect(() => unmount()).not.toThrow()
  })

  test('swallows a throwing unsubscribe', () => {
    installBridge(() => () => {
      throw new Error('detach failed')
    })
    const { unmount } = render(<SessionSwitchOverlay />)
    expect(() => unmount()).not.toThrow()
  })

  test('does nothing without the projection bridge', () => {
    const { container } = render(<SessionSwitchOverlay />)
    expect(container).toBeEmptyDOMElement()
  })
})
