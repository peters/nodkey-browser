import { describe, expect, it } from 'vitest'
import { browserInfo, defaultAgentName } from './browser'

describe('browserInfo', () => {
  it('tells the browsers and systems apart', () => {
    expect(
      browserInfo('Mozilla/5.0 (X11; Linux x86_64; rv:157.0) Gecko/20100101 Firefox/157.0'),
    ).toEqual({ browser: 'Firefox', system: 'Linux' })
    expect(
      browserInfo(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
      ),
    ).toEqual({ browser: 'Chrome', system: 'macOS' })
    expect(
      browserInfo(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      ).browser,
    ).toBe('Edge')
    expect(browserInfo('Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0', true).browser).toBe('Brave')
    expect(
      browserInfo(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15',
      ),
    ).toEqual({ browser: 'Safari', system: 'macOS' })
  })
  it('makes a default name', () => {
    expect(defaultAgentName({ browser: 'Firefox', system: 'Linux' })).toBe('Firefox on Linux')
  })
})
