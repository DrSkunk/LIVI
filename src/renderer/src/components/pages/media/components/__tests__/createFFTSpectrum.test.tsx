import { render, screen, waitFor } from '@testing-library/react'
import { Suspense } from 'react'
import { FFTSpectrum } from '../createFFTSpectrum'

vi.mock('../FFTSpectrum', () => ({
  FFTSpectrum: () => <div>spectrum-loaded</div>
}))

describe('createFFTSpectrum', () => {
  test('lazily resolves the FFTSpectrum component', async () => {
    render(
      <Suspense fallback={<div>loading</div>}>
        <FFTSpectrum />
      </Suspense>
    )

    await waitFor(() => {
      expect(screen.getByText('spectrum-loaded')).toBeInTheDocument()
    })
  })
})
