const state = vi.hoisted(() => ({ template: '' as string | null }))

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  dialog: { showMessageBox: vi.fn() }
}))

vi.mock('child_process', () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn()
}))

vi.mock('fs', () => {
  const mock = {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => {
      if (state.template === null) throw new Error('template unreadable')
      return state.template
    })
  }
  return { ...mock, default: mock }
})

describe('phoneVendorIdsFromUdevTemplate cache variants', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  test('returns null and caches it when the template has no phone vendor entries', async () => {
    state.template =
      'SUBSYSTEM=="usb", ATTR{idVendor}=="1314", ATTR{idProduct}=="1520", MODE="0660"\n'
    const mod = await import('../udevRule')
    expect(mod.phoneVendorIdsFromUdevTemplate()).toBeNull()
    expect(mod.phoneVendorIdsFromUdevTemplate()).toBeNull()
  })

  test('returns null when the template cannot be read', async () => {
    state.template = null
    const mod = await import('../udevRule')
    expect(mod.phoneVendorIdsFromUdevTemplate()).toBeNull()
  })
})
