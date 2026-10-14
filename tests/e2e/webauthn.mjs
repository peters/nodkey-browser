// A small WebAuthn relying party for the browser test: it makes challenges and checks what the
// browser sends back, as a real website does (clientDataJSON, authenticator data, the attestation
// object and the ES256 signature). Test use only.
import { createHash, createPublicKey, randomBytes, verify } from 'node:crypto'

const b64u = (/** @type {Uint8Array} */ b) => Buffer.from(b).toString('base64url')
const unb64u = (/** @type {string} */ s) => Buffer.from(s, 'base64url')

/**
 * Decodes one CBOR item (the subset in attestation objects and COSE keys).
 * @param {Buffer} buf @param {number} [at]
 * @returns {[unknown, number]} the value and the offset after it
 */
export function cbor(buf, at = 0) {
  const head = buf[at] ?? 0
  const major = head >> 5
  const info = head & 31
  let pos = at + 1
  let n = info
  if (info === 24) {
    n = buf.readUInt8(pos)
    pos += 1
  } else if (info === 25) {
    n = buf.readUInt16BE(pos)
    pos += 2
  } else if (info === 26) {
    n = buf.readUInt32BE(pos)
    pos += 4
  }
  if (info > 26) throw new Error(`unsupported CBOR length ${info}`)
  switch (major) {
    case 0:
      return [n, pos]
    case 1:
      return [-1 - n, pos]
    case 2:
      return [buf.subarray(pos, pos + n), pos + n]
    case 3:
      return [buf.subarray(pos, pos + n).toString('utf8'), pos + n]
    case 4: {
      const list = []
      for (let i = 0; i < n; i++) {
        const [v, next] = cbor(buf, pos)
        list.push(v)
        pos = next
      }
      return [list, pos]
    }
    case 5: {
      const map = new Map()
      for (let i = 0; i < n; i++) {
        const [k, afterKey] = cbor(buf, pos)
        const [v, afterValue] = cbor(buf, afterKey)
        map.set(k, v)
        pos = afterValue
      }
      return [map, pos]
    }
    default:
      throw new Error(`unsupported CBOR major type ${major}`)
  }
}

/** @param {Buffer} data */
function parseAuthData(data) {
  if (data.length < 37) throw new Error('authenticator data too short')
  const out = {
    rpIdHash: data.subarray(0, 32),
    flags: data[32] ?? 0,
    signCount: data.readUInt32BE(33),
    credentialId: /** @type {Buffer | null} */ (null),
    coseKey: /** @type {Map<number, unknown> | null} */ (null),
  }
  if (out.flags & 0x40) {
    const length = data.readUInt16BE(53)
    out.credentialId = data.subarray(55, 55 + length)
    const [key] = cbor(data, 55 + length)
    out.coseKey = /** @type {Map<number, unknown>} */ (key)
  }
  return out
}

/** An ES256 COSE key as a Node public key. @param {Map<number, unknown>} cose */
function es256Key(cose) {
  if (cose.get(1) !== 2 || cose.get(3) !== -7 || cose.get(-1) !== 1) {
    throw new Error('not an ES256 P-256 key')
  }
  const x = /** @type {Buffer} */ (cose.get(-2))
  const y = /** @type {Buffer} */ (cose.get(-3))
  return createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x: b64u(x), y: b64u(y) },
    format: 'jwk',
  })
}

/**
 * The relying party for one origin. `registerOptions` and `loginOptions` make the options a page
 * passes to WebAuthn (binary as base64url); `register` and `login` check the page's answer (the
 * `toJSON()` of the credential) and throw on any mismatch.
 * @param {string} rpId @param {string} origin
 */
export function relyingParty(rpId, origin) {
  /** @type {Map<string, { key: import('node:crypto').KeyObject, userId: string, name: string }>} */
  const credentials = new Map()
  /** @type {Set<string>} */
  const challenges = new Set()
  const rpIdHash = createHash('sha256').update(rpId).digest()

  const challenge = () => {
    const c = b64u(randomBytes(32))
    challenges.add(c)
    return c
  }

  /** @param {string} cdjB64u @param {string} type */
  const checkClientData = (cdjB64u, type) => {
    const cdj = JSON.parse(unb64u(cdjB64u).toString('utf8'))
    if (cdj.type !== type) throw new Error(`clientDataJSON.type ${cdj.type}`)
    if (!challenges.delete(cdj.challenge)) throw new Error('unknown or reused challenge')
    if (cdj.origin !== origin) throw new Error(`clientDataJSON.origin ${cdj.origin}`)
    if (cdj.crossOrigin) throw new Error('crossOrigin is set')
  }

  /** @param {ReturnType<typeof parseAuthData>} auth */
  const checkAuth = (auth) => {
    if (!auth.rpIdHash.equals(rpIdHash)) throw new Error('rpIdHash is not for this site')
    if (!(auth.flags & 0x01)) throw new Error('user presence flag is not set')
  }

  return {
    credentials,
    /** @param {string} name */
    registerOptions(name) {
      return {
        challenge: challenge(),
        rp: { name: 'Nodkey test site', id: rpId },
        user: { id: b64u(Buffer.from(`user-${name}`)), name, displayName: name.split('@')[0] },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        // Only this user's passkeys, as a real website does: Chromium and Firefox share the site.
        excludeCredentials: [...credentials]
          .filter(([, c]) => c.name === name)
          .map(([id]) => ({ type: 'public-key', id })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        attestation: 'none',
      }
    },
    /** @param {any} cred @param {string} name */
    register(cred, name) {
      checkClientData(cred.response.clientDataJSON, 'webauthn.create')
      const [att] = cbor(unb64u(cred.response.attestationObject))
      const map = /** @type {Map<string, unknown>} */ (att)
      if (map.get('fmt') !== 'none') throw new Error(`attestation format ${map.get('fmt')}`)
      const auth = parseAuthData(/** @type {Buffer} */ (map.get('authData')))
      checkAuth(auth)
      if (!auth.credentialId || !auth.coseKey) throw new Error('no attested credential data')
      if (b64u(auth.credentialId) !== cred.id || cred.rawId !== cred.id) {
        throw new Error('the credential id differs from the attested one')
      }
      const key = es256Key(auth.coseKey)
      // getPublicKey() must be the same key as the COSE key in the attestation object.
      const spki = createPublicKey({
        key: unb64u(cred.response.publicKey),
        format: 'der',
        type: 'spki',
      })
      if (!spki.equals(key)) throw new Error('getPublicKey() differs from the attested key')
      if (cred.response.publicKeyAlgorithm !== -7) throw new Error('not ES256')
      credentials.set(cred.id, { key, userId: b64u(Buffer.from(`user-${name}`)), name })
      return { ok: true, flags: auth.flags }
    },
    loginOptions() {
      return {
        challenge: challenge(),
        rpId,
        allowCredentials: [...credentials.keys()].map((id) => ({ type: 'public-key', id })),
        userVerification: 'required',
      }
    },
    /** @param {any} cred */
    login(cred) {
      const known = credentials.get(cred.id)
      if (!known) throw new Error('unknown credential')
      checkClientData(cred.response.clientDataJSON, 'webauthn.get')
      const authData = unb64u(cred.response.authenticatorData)
      checkAuth(parseAuthData(authData))
      const hash = createHash('sha256').update(unb64u(cred.response.clientDataJSON)).digest()
      const signed = Buffer.concat([authData, hash])
      const sig = unb64u(cred.response.signature)
      if (!verify('sha256', signed, { key: known.key, dsaEncoding: 'der' }, sig)) {
        throw new Error('the ES256 signature is not valid')
      }
      if (cred.response.userHandle !== undefined && cred.response.userHandle !== known.userId) {
        throw new Error('the user handle differs')
      }
      return { ok: true, name: known.name }
    },
  }
}
