/**
 * The page script (main world, document start): replaces `navigator.credentials.get` and
 * `create` for `publicKey` requests and hands them to the bridge content script, which asks the
 * background. Everything else goes to the browser. The background, not this script, decides the
 * origin; this script only carries the page's options (ADR-0007).
 */

import {
  PAGE_CANCEL,
  PAGE_REPLY,
  PAGE_REQUEST,
  type PasskeyCreateCall,
  type PasskeyGetCall,
  type PasskeyReply,
  type PrfCall,
  type PrfValues,
  type Requirement,
} from '../models/passkey'
import { encode } from './b64u'
import { makeCredential } from './credential'

type Options = CredentialRequestOptions & CredentialCreationOptions
/** Page data: the types are what the page claims, so each value is checked here. */
type Loose = Record<string, unknown>

function loose(v: unknown, what: string): Loose {
  if (typeof v !== 'object' || v === null) throw new TypeError(`${what} must be an object`)
  return v as Loose
}

function bytes(v: unknown, what: string): string {
  if (v instanceof ArrayBuffer) return encode(new Uint8Array(v))
  if (ArrayBuffer.isView(v)) return encode(new Uint8Array(v.buffer, v.byteOffset, v.byteLength))
  throw new TypeError(`${what} must be a BufferSource`)
}

function text(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new TypeError(`${what} must be a string`)
  return v
}

function optText(v: unknown, what: string): string | undefined {
  return v === undefined ? undefined : text(v, what)
}

function idList(v: unknown, what: string): string[] {
  if (v === undefined) return []
  if (!Array.isArray(v)) throw new TypeError(`${what} must be a list`)
  return v.map((d) => bytes(loose(d, what).id, what))
}

/** An enum member as the page gave it; the background ignores values it does not know. */
function requirement(v: unknown, fallback: Requirement): Requirement {
  return typeof v === 'string' ? (v as Requirement) : fallback
}

function prfValues(v: unknown, what: string): PrfValues {
  const o = loose(v, what)
  const out: PrfValues = { first: bytes(o.first, `${what}.first`) }
  if (o.second !== undefined) out.second = bytes(o.second, `${what}.second`)
  return out
}

/**
 * `extensions.prf` with its BufferSources in base64url. The keys of `evalByCredential` are
 * base64url credential ids already; the background checks them against `allowCredentials`.
 */
function prfCall(extensions: unknown): PrfCall | undefined {
  if (extensions === undefined) return undefined
  const prf = loose(extensions, 'extensions').prf
  if (prf === undefined) return undefined
  const o = loose(prf, 'prf')
  const out: PrfCall = {}
  if (o.eval !== undefined) out.eval = prfValues(o.eval, 'prf.eval')
  if (o.evalByCredential !== undefined) {
    const by = loose(o.evalByCredential, 'prf.evalByCredential')
    out.evalByCredential = Object.fromEntries(
      Object.entries(by).map(([id, values]) => [id, prfValues(values, 'prf.evalByCredential')]),
    )
  }
  return out
}

function getCall(o: Loose): PasskeyGetCall {
  const call: PasskeyGetCall = {
    op: 'get',
    challenge: bytes(o.challenge, 'challenge'),
    allowCredentials: idList(o.allowCredentials, 'allowCredentials'),
    userVerification: requirement(o.userVerification, 'preferred'),
  }
  const rpId = optText(o.rpId, 'rpId')
  if (rpId !== undefined) call.rpId = rpId
  const prf = prfCall(o.extensions)
  if (prf) call.prf = prf
  return call
}

function createCall(o: Loose): PasskeyCreateCall {
  const rp = loose(o.rp, 'rp')
  const user = loose(o.user, 'user')
  const selection =
    o.authenticatorSelection === undefined
      ? {}
      : loose(o.authenticatorSelection, 'authenticatorSelection')
  const params = o.pubKeyCredParams
  if (!Array.isArray(params)) throw new TypeError('pubKeyCredParams must be a list')
  const residentKey = requirement(
    selection.residentKey,
    selection.requireResidentKey === true ? 'required' : 'discouraged',
  )
  const call: PasskeyCreateCall = {
    op: 'create',
    challenge: bytes(o.challenge, 'challenge'),
    rp: { name: text(rp.name, 'rp.name') },
    user: {
      id: bytes(user.id, 'user.id'),
      name: text(user.name, 'user.name'),
      displayName: text(user.displayName, 'user.displayName'),
    },
    algorithms: params
      .map((p) => loose(p, 'pubKeyCredParams'))
      .filter((p) => p.type === 'public-key')
      .map((p) => Number(p.alg)),
    excludeCredentials: idList(o.excludeCredentials, 'excludeCredentials'),
    residentKey,
    userVerification: requirement(selection.userVerification, 'preferred'),
  }
  const rpId = optText(rp.id, 'rp.id')
  if (rpId !== undefined) call.rp.id = rpId
  const prf = prfCall(o.extensions)
  if (prf) call.prf = prf
  return call
}

let next = 0
const run = Math.random().toString(36).slice(2)

function send(type: string, detail: unknown): void {
  window.dispatchEvent(new CustomEvent(type, { detail: JSON.stringify(detail) }))
}

/** Sends one call to the bridge and waits for the answer, or for `signal`. */
function ask(
  call: PasskeyGetCall | PasskeyCreateCall,
  signal: AbortSignal | undefined,
): Promise<PublicKeyCredential> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason as Error)
      return
    }
    const id = `${run}-${++next}`
    const done = () => {
      window.removeEventListener(PAGE_REPLY, onReply)
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      done()
      send(PAGE_CANCEL, { id })
      reject(signal?.reason as Error)
    }
    const onReply = (e: Event) => {
      let msg: { id?: unknown; reply?: PasskeyReply }
      try {
        msg = JSON.parse(String((e as CustomEvent<unknown>).detail)) as typeof msg
      } catch {
        return
      }
      if (msg.id !== id || !msg.reply) return
      done()
      const reply = msg.reply
      if (!reply.ok) {
        reject(new DOMException(reply.message, reply.name))
        return
      }
      try {
        resolve(makeCredential(reply.result))
      } catch {
        reject(new DOMException('the answer was not valid', 'NotAllowedError'))
      }
    }
    window.addEventListener(PAGE_REPLY, onReply)
    signal?.addEventListener('abort', onAbort)
    send(PAGE_REQUEST, { id, call })
  })
}

/** A conditional (autofill) request never reaches the phone: it waits until it is aborted. */
function never(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_, reject) => {
    if (signal?.aborted) reject(signal.reason as Error)
    signal?.addEventListener('abort', () => {
      reject(signal.reason as Error)
    })
  })
}

function install(): void {
  if (typeof CredentialsContainer === 'undefined' || typeof PublicKeyCredential === 'undefined') {
    return
  }
  type Native = (this: CredentialsContainer, options?: Options) => Promise<Credential | null>
  const proto = CredentialsContainer.prototype
  const nativeGet = Object.getOwnPropertyDescriptor(proto, 'get')?.value as Native
  const nativeCreate = Object.getOwnPropertyDescriptor(proto, 'create')?.value as Native
  const methods = {
    get(this: CredentialsContainer, options?: Options): Promise<Credential | null> {
      if (!options?.publicKey) return nativeGet.call(this, options)
      const mediation = options.mediation
      if (mediation === 'conditional') return never(options.signal)
      if (mediation === 'silent') {
        return Promise.reject(new DOMException('no silent passkey sign-in', 'NotAllowedError'))
      }
      // A thrown TypeError becomes the rejection, as in the browser's own method.
      return Promise.resolve().then(() =>
        ask(getCall(loose(options.publicKey, 'publicKey')), options.signal),
      )
    },
    create(this: CredentialsContainer, options?: Options): Promise<Credential | null> {
      if (!options?.publicKey) return nativeCreate.call(this, options)
      return Promise.resolve().then(() =>
        ask(createCall(loose(options.publicKey, 'publicKey')), options.signal),
      )
    },
  }
  // Enumerable, writable and configurable, as the browser's own operations are.
  Object.defineProperties(proto, Object.getOwnPropertyDescriptors(methods))

  const replace = (name: string, fn: () => Promise<unknown>) => {
    Object.defineProperty(PublicKeyCredential, name, {
      value: fn,
      enumerable: true,
      writable: true,
      configurable: true,
    })
  }
  replace('isUserVerifyingPlatformAuthenticatorAvailable', function available() {
    return Promise.resolve(true)
  })
  replace('isConditionalMediationAvailable', function conditional() {
    return Promise.resolve(false)
  })
  const capabilities = Object.getOwnPropertyDescriptor(PublicKeyCredential, 'getClientCapabilities')
    ?.value as (() => Promise<Record<string, boolean>>) | undefined
  if (typeof capabilities === 'function') {
    replace('getClientCapabilities', async function getClientCapabilities() {
      const native = await capabilities.call(PublicKeyCredential)
      return {
        ...native,
        conditionalGet: false,
        conditionalCreate: false,
        passkeyPlatformAuthenticator: true,
        userVerifyingPlatformAuthenticator: true,
      }
    })
  }
}

install()
