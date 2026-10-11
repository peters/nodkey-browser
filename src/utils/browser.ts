/** Which browser and system the extension runs in, from the user agent string. */

export interface BrowserInfo {
  /** "Firefox", "Chrome", "Edge", "Brave", "Chromium". */
  browser: string
  /** "Linux", "macOS", "Windows", "ChromeOS". */
  system: string
}

export function browserInfo(userAgent: string, brave = false): BrowserInfo {
  const ua = userAgent
  let browser = 'Chromium'
  if (/Firefox\//.test(ua)) browser = 'Firefox'
  else if (/Edg\//.test(ua)) browser = 'Edge'
  else if (brave) browser = 'Brave'
  else if (/Chrome\//.test(ua)) browser = 'Chrome'
  let system = 'Linux'
  if (/Mac OS X|Macintosh/.test(ua)) system = 'macOS'
  else if (/Windows/.test(ua)) system = 'Windows'
  else if (/CrOS/.test(ua)) system = 'ChromeOS'
  return { browser, system }
}

/** The name the phone shows when the person does not pick one: "Firefox on Linux". */
export function defaultAgentName(info: BrowserInfo): string {
  return `${info.browser} on ${info.system}`
}
