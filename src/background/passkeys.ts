/**
 * Passkeys for web pages (ADR-0007): checks the caller with the browser's own sender data, builds
 * `clientDataJSON`, asks the phone to sign and gives the page what WebAuthn returns. Also keeps
 * the page script and the bridge registered while the bridge is on and a phone is paired.
 */

import { check_passkey_answer, client_data_json } from '../wasm/nodkey.js'
import type { ActivityState } from '../models/messages'
import {
  type PasskeyCall,
  PasskeyError,
  type PasskeyReply,
  type PasskeyResult,
  type PrfCall,
  type PrfResult,
  hasPrfInputs,
  parsePasskeyCall,
} from '../models/passkey'
import type { Answer, PasskeyAnswer } from '../models/protocol'
import { decode } from '../passkeys/b64u'
import { checkFrame, rpIdFor, secureHost, senderOrigin } from '../passkeys/origin'
import { t } from '../i18n/t'
import { siteOf } from '../utils/site'
import { client, info, publish } from './actions'
import { ask } from './agent'
import { failed, notApproved } from './outcome'
import * as store from './store'

/** ES256, the only algorithm Nodkey makes passkeys with. */
const ES256 = -7

/** Tabs with a passkey request on the phone: one at a time per tab. */
const busy = new Set<number>()

/** `prf` in the protocol's names. A get without inputs sends none (the phone refuses it). */
function prfRequest(
  prf: PrfCall | undefined,
  op: 'get' | 'create',
): Record<string, unknown> | null {
  if (!prf) return null
  if (op === 'get' && !hasPrfInputs(prf)) return null
  const out: Record<string, unknown> = {}
  if (prf.eval) out.eval = prf.eval
  if (prf.evalByCredential) out.eval_by_credential = prf.evalByCredential
  return out
}

function snake(
  call: PasskeyCall,
  rpId: string,
  cdj: string,
  withPrf = true,
): Record<string, unknown> {
  const prf = withPrf ? prfRequest(call.prf, call.op) : null
  if (call.op === 'get') {
    const get: Record<string, unknown> = {
      op: 'get',
      rp_id: rpId,
      client_data_json: cdj,
      allow_credentials: call.allowCredentials,
      user_verification: call.userVerification,
    }
    if (prf) get.prf = prf
    return get
  }
  const create: Record<string, unknown> = {
    op: 'create',
    rp_id: rpId,
    rp_name: call.rp.name,
    client_data_json: cdj,
    user: { id: call.user.id, name: call.user.name, display_name: call.user.displayName },
    algorithms: call.algorithms,
    exclude_credentials: call.excludeCredentials,
    resident_key: call.residentKey,
    user_verification: call.userVerification,
  }
  if (prf) create.prf = prf
  return create
}

/**
 * `getClientExtensionResults().prf` for the page, when it asked for PRF. A get whose passkey has no
 * PRF gets no results, as a browser gives for an authenticator without PRF; a create from an app
 * without PRF says `enabled: false`.
 */
function prfResult(call: PasskeyCall, p: PasskeyAnswer): PrfResult | undefined {
  if (!call.prf) return undefined
  const out: PrfResult = {}
  if (call.op === 'create') out.enabled = p.prf?.enabled ?? false
  if (p.prf?.results) out.results = { ...p.prf.results }
  return out
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

/**
 * Checks the phone's answer before the page gets it: nodkey-proto's check (authenticator data for
 * `rp_id` with the user present, the fields of the operation, an ES256 key), then that a get used
 * an allowed passkey and that a new passkey's authenticator data names its credential id.
 */
function result(
  call: PasskeyCall,
  request: Record<string, unknown>,
  cdj: string,
  p: PasskeyAnswer,
): PasskeyResult {
  try {
    check_passkey_answer(JSON.stringify(request), JSON.stringify(p))
  } catch (e) {
    throw new PasskeyError('NotAllowedError', e instanceof Error ? e.message : String(e))
  }
  if (call.op === 'get') {
    const allowed = call.allowCredentials
    if (!p.signature || (allowed.length > 0 && !allowed.includes(p.credential_id))) {
      throw new PasskeyError('NotAllowedError', 'the phone answered with another passkey')
    }
    const out: PasskeyResult = {
      op: 'get',
      clientDataJSON: cdj,
      credentialId: p.credential_id,
      authenticatorData: p.authenticator_data,
      signature: p.signature,
    }
    if (p.user_handle !== undefined) out.userHandle = p.user_handle
    const prf = prfResult(call, p)
    if (prf) out.prf = prf
    return out
  }
  const data = decode(p.authenticator_data)
  const length = ((data[53] ?? 0) << 8) | (data[54] ?? 0)
  if (
    !p.attestation_object ||
    !p.public_key ||
    p.public_key_algorithm !== ES256 ||
    !equal(data.subarray(55, 55 + length), decode(p.credential_id))
  ) {
    throw new PasskeyError('NotAllowedError', 'the new passkey does not match its data')
  }
  const out: PasskeyResult = {
    op: 'create',
    clientDataJSON: cdj,
    credentialId: p.credential_id,
    attestationObject: p.attestation_object,
    authenticatorData: p.authenticator_data,
    publicKey: p.public_key,
    publicKeyAlgorithm: p.public_key_algorithm,
  }
  const prf = prfResult(call, p)
  if (prf) out.prf = prf
  return out
}

/** The DOMException and the text for an answer that is not an approval. */
function refusal(answer: Answer | null, site: string): { error: PasskeyError; message: string } {
  const shown = notApproved(answer, 'passkey')
  const why = answer?.error
  if (why === 'excluded') {
    return {
      error: new PasskeyError('InvalidStateError', 'a passkey for this account exists'),
      message: t('actPasskeyExists', site),
    }
  }
  const message = why === 'no_passkey' ? t('actPasskeyNone', site) : shown.message
  const name = why === 'unsupported_algorithm' ? 'NotSupportedError' : 'NotAllowedError'
  return { error: new PasskeyError(name, why ?? answer?.decision ?? 'expired'), message }
}

/** Rejects when `signal` aborts: the page does not wait for the phone's next poll round. */
function abortion(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => {
      reject(new Error('aborted'))
    })
  })
}

/** One passkey call from the bridge in `sender`'s frame. */
export async function passkey(
  msg: { call?: unknown; sameOriginAncestors?: unknown },
  sender: chrome.runtime.MessageSender,
  signal: AbortSignal,
): Promise<PasskeyResult> {
  if (!(await store.settings()).passkeys) {
    throw new PasskeyError('NotAllowedError', 'the passkey bridge is off')
  }
  // The origin comes from the browser, never from the page.
  const origin = senderOrigin(sender)
  if (!origin) throw new PasskeyError('SecurityError', 'the page has no origin')
  const host = secureHost(origin)
  checkFrame(sender.frameId, origin, sender.tab?.url, msg.sameOriginAncestors === true)
  const call = parsePasskeyCall(msg.call)
  const rpId = rpIdFor(host, call.op === 'get' ? call.rpId : call.rp.id)
  if (call.op === 'create' && !call.algorithms.includes(ES256)) {
    throw new PasskeyError('NotSupportedError', 'Nodkey makes ES256 (-7) passkeys only')
  }
  const tabId = sender.tab?.id
  if (tabId === undefined) throw new PasskeyError('NotAllowedError', 'no tab')
  if (busy.has(tabId)) throw new PasskeyError('NotAllowedError', 'a passkey request is pending')
  busy.add(tabId)
  try {
    const site = siteOf(origin) ?? host
    const show = (state: ActivityState, message: string) =>
      publish(tabId, 'passkey', site, state, message, sender.frameId)
    const phone = await store.currentPhone()
    if (!phone) {
      await show('error', t('actNeedsPairing'))
      throw new PasskeyError('NotAllowedError', 'Nodkey is not paired with a phone')
    }
    // The origin is the browser's sender origin; the page only gives the challenge.
    const cdj = client_data_json(call.op, call.challenge, origin)
    const request = snake(call, rpId, cdj)
    await show('waiting', t('actWaiting'))
    const reason = t(
      call.op === 'get' ? 'reasonPasskeyGet' : 'reasonPasskeyCreate',
      site,
      info.browser,
    )
    let answer: Answer | null
    let sent = request
    try {
      const once = async (passkey: Record<string, unknown>) => {
        const asked = ask(
          { kind: 'passkey', site: rpId, reason, passkey, client: client() },
          phone,
          signal,
        )
        const got = (await Promise.race([asked, abortion(signal)])).answer
        if (signal.aborted) throw new Error('aborted')
        return got
      }
      answer = await once(request)
      // The site's passkey was made before PRF: sign in without it, as a browser does with an
      // authenticator without PRF (the person approves once more).
      if (answer?.error === 'prf_unsupported' && call.op === 'get') {
        sent = snake(call, rpId, cdj, false)
        answer = await once(sent)
      }
    } catch (e) {
      if (signal.aborted) {
        await show('denied', t('actPasskeyCancelled'))
        throw new PasskeyError('AbortError', 'the page cancelled the request')
      }
      const shown = failed(e)
      await show(shown.state, shown.message)
      throw new PasskeyError('NotAllowedError', shown.message)
    }
    if (answer?.decision !== 'approved' || !answer.passkey) {
      const { error, message } = refusal(answer, site)
      await show(
        answer?.decision === 'approved' ? 'error' : notApproved(answer, 'passkey').state,
        message,
      )
      throw error
    }
    // PRF needs Face ID each time: a PRF answer from a lease is refused (protocol, "PRF").
    if ('prf' in sent && answer.lease && answer.lease.kind !== 'once') {
      await show('error', t('actError', 'a PRF answer came from a lease'))
      throw new PasskeyError('NotAllowedError', 'a PRF answer came from a lease')
    }
    let out: PasskeyResult
    try {
      out = result(call, sent, cdj, answer.passkey)
    } catch (e) {
      await show('error', t('actError', e instanceof Error ? e.message : String(e)))
      throw e
    }
    await show('approved', t(call.op === 'get' ? 'actPasskeySignedIn' : 'actPasskeyCreated', site))
    return out
  } finally {
    busy.delete(tabId)
  }
}

/** Runs a call from the `passkey` port and turns errors into what the page script rejects with. */
export async function answer(
  msg: { call?: unknown; sameOriginAncestors?: unknown },
  sender: chrome.runtime.MessageSender,
  signal: AbortSignal,
): Promise<PasskeyReply> {
  try {
    return { ok: true, result: await passkey(msg, sender, signal) }
  } catch (e) {
    if (e instanceof PasskeyError) return { ok: false, name: e.domName, message: e.message }
    return {
      ok: false,
      name: 'NotAllowedError',
      message: e instanceof Error ? e.message : String(e),
    }
  }
}

const SCRIPTS: chrome.scripting.RegisteredContentScript[] = [
  {
    id: 'nodkey-passkey-bridge',
    js: ['passkey-bridge.js'],
    matches: ['https://*/*', 'http://localhost/*'],
    allFrames: true,
    runAt: 'document_start',
    persistAcrossSessions: true,
  },
  {
    id: 'nodkey-passkey-page',
    js: ['passkey-page.js'],
    matches: ['https://*/*', 'http://localhost/*'],
    allFrames: true,
    runAt: 'document_start',
    world: 'MAIN',
    persistAcrossSessions: true,
  },
]

let syncing: Promise<void> = Promise.resolve()

/**
 * Registers the page script and the bridge while the passkey bridge is on and a phone is paired,
 * and removes them otherwise. Pages that are open already change on their next load.
 */
export function syncPasskeyScripts(): Promise<void> {
  syncing = syncing
    .then(async () => {
      const want = (await store.settings()).passkeys && (await store.phones()).length > 0
      const ids = SCRIPTS.map((s) => s.id)
      const have = await chrome.scripting.getRegisteredContentScripts({ ids })
      if (want && have.length === SCRIPTS.length) return
      if (have.length > 0) {
        await chrome.scripting.unregisterContentScripts({ ids: have.map((s) => s.id) })
      }
      if (want) await chrome.scripting.registerContentScripts(SCRIPTS)
    })
    .catch((e: unknown) => {
      console.error('Nodkey: could not update the passkey scripts', e)
    })
  return syncing
}
