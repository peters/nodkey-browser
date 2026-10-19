/**
 * Whether `value` is a relay address the extension uses: `https://` for any host, plain `http://`
 * only for a relay on this computer (`localhost`, `127.0.0.1`, `[::1]`), as in the protocol
 * ("Relay API"). Bodies are sealed either way, but plain http on a network shows ids, sizes and
 * timing. No user name or password in the address.
 */
export function relayAddressOk(value: string): boolean {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return false
  }
  if (url.username || url.password || url.search || url.hash) return false
  if (url.protocol === 'https:') return url.hostname !== ''
  return (
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
  )
}
