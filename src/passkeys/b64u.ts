/** Base64url without padding, as WebAuthn and the Nodkey protocol use it (also in the page). */

const B64U = /^[A-Za-z0-9_-]*$/

export function isB64u(s: string): boolean {
  return B64U.test(s) && s.length % 4 !== 1
}

export function encode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decode(s: string): Uint8Array {
  if (!isB64u(s)) throw new TypeError('not base64url')
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export function encodeText(text: string): string {
  return encode(new TextEncoder().encode(text))
}
