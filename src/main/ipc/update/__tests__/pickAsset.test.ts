import { pickAssetForPlatform } from '@main/ipc/update/pickAsset'

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform })
}

function setArch(arch: string): void {
  Object.defineProperty(process, 'arch', { value: arch })
}

describe('pickAssetForPlatform', () => {
  const platform = process.platform
  const arch = process.arch

  beforeEach(() => {
    setPlatform(platform)
    setArch(arch)
  })

  test('returns empty object for non-array input', () => {
    expect(pickAssetForPlatform(null as unknown as never[])).toEqual({})
  })

  test('picks x64 AppImage on linux x64', () => {
    setPlatform('linux')
    setArch('x64')

    const result = pickAssetForPlatform([
      { name: 'LIVI-arm64.AppImage', browser_download_url: 'https://example.com/arm' } as never,
      { name: 'LIVI-x86_64.AppImage', browser_download_url: 'https://example.com/x64' } as never
    ])

    expect(result).toEqual({ url: 'https://example.com/x64' })
  })

  test('picks arm64 AppImage on linux arm64', () => {
    setPlatform('linux')
    setArch('arm64')

    const result = pickAssetForPlatform([
      {
        name: 'LIVI-aarch64.AppImage',
        browser_download_url: 'https://example.com/aarch64'
      } as never,
      { name: 'LIVI-x64.AppImage', browser_download_url: 'https://example.com/x64' } as never
    ])

    expect(result).toEqual({ url: 'https://example.com/aarch64' })
  })

  test('picks arm64/universal DMG on darwin arm64', () => {
    setPlatform('darwin')
    setArch('arm64')

    const result = pickAssetForPlatform([
      { name: 'LIVI-x64.dmg', browser_download_url: 'https://example.com/x64' } as never,
      { name: 'LIVI-universal.dmg', browser_download_url: 'https://example.com/universal' } as never
    ])

    expect(result).toEqual({ url: 'https://example.com/universal' })
  })

  test('picks x64/universal DMG on darwin x64', () => {
    setPlatform('darwin')
    setArch('x64')

    const result = pickAssetForPlatform([
      { name: 'LIVI-arm64.dmg', browser_download_url: 'https://example.com/arm64' } as never,
      { name: 'LIVI-x64.dmg', browser_download_url: 'https://example.com/x64' } as never
    ])

    expect(result).toEqual({ url: 'https://example.com/x64' })
  })

  test('returns an undefined url when no AppImage matches the arch patterns', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    Object.defineProperty(process, 'arch', { value: 'x64', configurable: true })
    expect(
      pickAssetForPlatform([
        { name: 'LIVI-riscv64.AppImage', browser_download_url: 'https://example.com/r' }
      ] as never)
    ).toEqual({ url: undefined })
  })

  test('returns empty object on unsupported platforms', () => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    expect(
      pickAssetForPlatform([
        { name: 'LIVI-x86_64.AppImage', browser_download_url: 'https://example.com/a' }
      ] as never)
    ).toEqual({})
  })

  test('returns empty object for unsupported linux arch', () => {
    setPlatform('linux')
    setArch('arm')

    const result = pickAssetForPlatform([
      { name: 'LIVI-x86_64.AppImage', browser_download_url: 'https://example.com/x64' } as never,
      { name: 'LIVI-arm64.AppImage', browser_download_url: 'https://example.com/arm64' } as never
    ])

    expect(result).toEqual({})
  })
  test('uses browser_download_url as fallback name source', () => {
    setPlatform('linux')
    setArch('x64')

    const result = pickAssetForPlatform([
      { browser_download_url: 'https://example.com/LIVI-x86_64.AppImage' } as never
    ])

    expect(result).toEqual({ url: 'https://example.com/LIVI-x86_64.AppImage' })
  })

  test('returns empty object when no dmg assets exist on darwin', () => {
    setPlatform('darwin')
    setArch('arm64')

    const result = pickAssetForPlatform([
      { name: 'LIVI-x64.zip', browser_download_url: 'https://example.com/x64.zip' } as never
    ])

    expect(result).toEqual({})
  })

  test('falls back to first dmg on darwin arm64 when no preferred dmg matches', () => {
    setPlatform('darwin')
    setArch('arm64')

    const result = pickAssetForPlatform([
      { name: 'LIVI-plain.dmg', browser_download_url: 'https://example.com/plain' } as never,
      { name: 'LIVI-other.dmg', browser_download_url: 'https://example.com/other' } as never
    ])

    expect(result).toEqual({ url: 'https://example.com/plain' })
  })

  test('falls back to first dmg on darwin x64 when no preferred dmg matches', () => {
    setPlatform('darwin')
    setArch('x64')

    const result = pickAssetForPlatform([
      { name: 'LIVI-plain.dmg', browser_download_url: 'https://example.com/plain' } as never,
      { name: 'LIVI-other.dmg', browser_download_url: 'https://example.com/other' } as never
    ])

    expect(result).toEqual({ url: 'https://example.com/plain' })
  })

  test('returns empty object when no AppImage assets exist on linux', () => {
    setPlatform('linux')
    setArch('x64')

    const result = pickAssetForPlatform([
      { name: 'LIVI-x64.zip', browser_download_url: 'https://example.com/x64.zip' } as never
    ])

    expect(result).toEqual({})
  })

  test('falls back to empty string when asset has neither name nor browser_download_url', () => {
    setPlatform('linux')
    setArch('x64')

    const result = pickAssetForPlatform([{} as never])

    expect(result).toEqual({})
  })
})
