// Writes public/_locales/<locale>/messages.json from src/i18n/messages/<lang>.json, the format the
// browsers read. Every language must have every key of en.json (a test checks it too).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'

/** Our language file names to the browsers' locale folder names. @type {Record<string, string>} */
const LOCALES = {
  en: 'en',
  nb: 'nb',
  sv: 'sv',
  da: 'da',
  de: 'de',
  es: 'es',
  fr: 'fr',
  it: 'it',
  'pt-BR': 'pt_BR',
  ja: 'ja',
  ko: 'ko',
  'zh-Hans': 'zh_CN',
}

const dir = 'src/i18n/messages'
const en = JSON.parse(readFileSync(`${dir}/en.json`, 'utf8'))
for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const lang = file.slice(0, -5)
  const locale = LOCALES[lang]
  if (!locale) throw new Error(`no browser locale for ${lang}`)
  /** @type {Record<string, string>} */
  const strings = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'))
  const missing = Object.keys(en).filter((k) => !(k in strings))
  if (missing.length > 0) throw new Error(`${lang} misses ${missing.join(', ')}`)
  /** @type {Record<string, { message: string }>} */
  const out = {}
  for (const [key, message] of Object.entries(strings)) out[key] = { message }
  mkdirSync(`public/_locales/${locale}`, { recursive: true })
  writeFileSync(`public/_locales/${locale}/messages.json`, `${JSON.stringify(out, null, 2)}\n`)
}
