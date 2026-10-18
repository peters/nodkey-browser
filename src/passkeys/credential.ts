/**
 * Builds the `PublicKeyCredential` a page gets from the phone's answer. The objects inherit from
 * the browser's own prototypes, so `instanceof` works, and carry their values as own properties
 * (the native getters only work on objects the browser made). Runs in the page.
 */

import type { PasskeyResult, PrfResult } from '../models/passkey'
import { decode } from './b64u'

/** Where the passkey lives: the phone, reached through the relay. Sorted, as WebAuthn asks. */
export const TRANSPORTS = ['hybrid', 'internal']

function buffer(b64u: string): ArrayBuffer {
  const bytes = decode(b64u)
  const out = new ArrayBuffer(bytes.length)
  new Uint8Array(out).set(bytes)
  return out
}

function protoOf(name: string): object {
  const ctor = (globalThis as Record<string, unknown>)[name]
  const proto = typeof ctor === 'function' ? (ctor as { prototype?: unknown }).prototype : null
  return typeof proto === 'object' && proto !== null ? proto : Object.prototype
}

function make(name: string, values: Record<string, unknown>): object {
  const props: PropertyDescriptorMap = {}
  for (const [key, value] of Object.entries(values)) {
    // Methods stay writable: the browser's own methods are writable on the prototype, so pages
    // replace them (`@github/webauthn-json` sets `credential.toJSON`). An assignment to a
    // read-only property throws in strict code. Values stay read-only, as the native getters are.
    const writable = typeof value === 'function'
    props[key] = { value, enumerable: false, configurable: true, writable }
  }
  return Object.create(protoOf(name), props) as object
}

/** `getClientExtensionResults().prf` with ArrayBuffers, and its JSON form in base64url. */
function prfOutputs(prf: PrfResult | undefined): {
  value: Record<string, unknown>
  json: Record<string, unknown>
} {
  if (!prf) return { value: {}, json: {} }
  const value: Record<string, unknown> = {}
  const json: Record<string, unknown> = {}
  if (prf.enabled !== undefined) {
    value.enabled = prf.enabled
    json.enabled = prf.enabled
  }
  if (prf.results) {
    const { first, second } = prf.results
    value.results =
      second === undefined
        ? { first: buffer(first) }
        : { first: buffer(first), second: buffer(second) }
    json.results = second === undefined ? { first } : { first, second }
  }
  return { value: { prf: value }, json: { prf: json } }
}

/** A `PublicKeyCredential` (with its response) for an approved passkey call. */
export function makeCredential(result: PasskeyResult): PublicKeyCredential {
  const rawId = buffer(result.credentialId)
  const clientDataJSON = buffer(result.clientDataJSON)
  const authenticatorData = buffer(result.authenticatorData)
  let response: object
  let responseJSON: Record<string, unknown>
  if (result.op === 'get') {
    const signature = buffer(result.signature)
    const userHandle = result.userHandle === undefined ? null : buffer(result.userHandle)
    response = make('AuthenticatorAssertionResponse', {
      clientDataJSON,
      authenticatorData,
      signature,
      userHandle,
    })
    responseJSON = {
      clientDataJSON: result.clientDataJSON,
      authenticatorData: result.authenticatorData,
      signature: result.signature,
    }
    if (result.userHandle !== undefined) responseJSON.userHandle = result.userHandle
  } else {
    const attestationObject = buffer(result.attestationObject)
    const publicKey = buffer(result.publicKey)
    const algorithm = result.publicKeyAlgorithm
    response = make('AuthenticatorAttestationResponse', {
      clientDataJSON,
      attestationObject,
      getAuthenticatorData: function getAuthenticatorData() {
        return authenticatorData.slice(0)
      },
      getPublicKey: function getPublicKey() {
        return publicKey.slice(0)
      },
      getPublicKeyAlgorithm: function getPublicKeyAlgorithm() {
        return algorithm
      },
      getTransports: function getTransports() {
        return [...TRANSPORTS]
      },
    })
    responseJSON = {
      clientDataJSON: result.clientDataJSON,
      authenticatorData: result.authenticatorData,
      transports: [...TRANSPORTS],
      publicKey: result.publicKey,
      publicKeyAlgorithm: algorithm,
      attestationObject: result.attestationObject,
    }
  }
  const extensions = prfOutputs(result.prf)
  const credential = make('PublicKeyCredential', {
    id: result.credentialId,
    rawId,
    type: 'public-key',
    authenticatorAttachment: 'platform',
    response,
    // A new object each time, as the browser gives: the page may change what it got.
    getClientExtensionResults: function getClientExtensionResults() {
      return prfOutputs(result.prf).value
    },
    toJSON: function toJSON() {
      return {
        id: result.credentialId,
        rawId: result.credentialId,
        type: 'public-key',
        authenticatorAttachment: 'platform',
        response: { ...responseJSON },
        clientExtensionResults: extensions.json,
      }
    },
  })
  return credential as PublicKeyCredential
}
