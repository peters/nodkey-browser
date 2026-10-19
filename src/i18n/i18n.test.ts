// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from './messages/en.json'
import { t } from './t'

const dir = join(process.cwd(), 'src/i18n/messages')
const LANGUAGES = ['da', 'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'nb', 'pt-BR', 'sv', 'zh-Hans']

describe('localization', () => {
  it('has the twelve languages of the iPhone app', () => {
    const files = readdirSync(dir).map((f) => f.replace(/\.json$/, ''))
    expect(files.sort()).toEqual(LANGUAGES)
  })

  for (const lang of LANGUAGES) {
    it(`${lang} has every key, no extra keys and the same placeholders`, () => {
      const strings = JSON.parse(readFileSync(join(dir, `${lang}.json`), 'utf8')) as Record<
        string,
        string
      >
      expect(Object.keys(strings).sort()).toEqual(Object.keys(en).sort())
      for (const [key, text] of Object.entries(en)) {
        const want = (text.match(/\$\d/g) ?? []).sort()
        const got = (strings[key]?.match(/\$\d/g) ?? []).sort()
        expect(got, `${lang}.${key}`).toEqual(want)
        expect(strings[key]?.trim(), `${lang}.${key}`).not.toBe('')
      }
    })
  }

  it('fills placeholders outside the browser', () => {
    expect(t('pairAnswered', 'Test iPhone')).toBe('Test iPhone answered.')
  })
})
