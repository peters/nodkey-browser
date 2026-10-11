/** The site a page belongs to, as Nodkey names it in requests: the host without `www.`. */
export function siteOf(url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  const host = u.hostname.toLowerCase().replace(/\.$/, '')
  if (!host) return null
  return host.startsWith('www.') ? host.slice(4) : host
}

/** True for addresses that never leave this computer or the home network. */
export function isLocalHost(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, '')
  return (
    h === 'localhost' ||
    h.endsWith('.local') ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(h) ||
    h.includes(':') // IPv6 literal
  )
}

/**
 * Whether Nodkey may fill a password into a page at `url`: HTTPS pages, and plain HTTP only for
 * local addresses (routers, printers, development servers).
 */
export function mayFill(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol === 'https:') return true
  return u.protocol === 'http:' && isLocalHost(u.hostname)
}

/** True when `frameUrl` is on `site` or one of its subdomains. */
export function belongsTo(frameUrl: string, site: string): boolean {
  const s = siteOf(frameUrl)
  return s !== null && (s === site || s.endsWith(`.${site}`) || site.endsWith(`.${s}`))
}
