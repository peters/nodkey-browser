/**
 * The passkey bridge (content script, document start): carries the page script's calls to the
 * background on a `passkey` port and the answers back, only after a click or a key press on the
 * page. A closed port cancels the request, also when the page goes away. One call at a time per
 * frame.
 */

import {
  PAGE_CANCEL,
  PAGE_REPLY,
  PAGE_REQUEST,
  type PasskeyPortMessage,
  type PasskeyReply,
} from '../models/passkey'

const open = new Map<string, chrome.runtime.Port>()

function reply(id: string, r: PasskeyReply): void {
  window.dispatchEvent(new CustomEvent(PAGE_REPLY, { detail: JSON.stringify({ id, reply: r }) }))
}

function parse(e: Event): { id: string; call?: unknown } | null {
  try {
    const v = JSON.parse(String((e as CustomEvent<unknown>).detail)) as { id?: unknown }
    return typeof v.id === 'string' && v.id.length <= 64 ? (v as { id: string }) : null
  } catch {
    return null
  }
}

/** True when every ancestor frame is on this frame's origin (always true in the top frame). */
function sameOriginAncestors(): boolean {
  try {
    let w: Window = window
    while (w !== w.parent) {
      w = w.parent
      if (w.location.origin !== location.origin) return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * True right after the person clicked or typed on the page (transient user activation). This
 * world reads the browser's own state; the page script cannot change it, and the page could
 * send the request event without its script.
 */
function activated(): boolean {
  return (navigator.userActivation as UserActivation | undefined)?.isActive === true
}

window.addEventListener(PAGE_REQUEST, (e) => {
  const msg = parse(e)
  if (!msg) return
  const { id } = msg
  // Only create and modal get come here (a conditional get waits in the page). Each needs a click
  // or a key press on the page, so a page cannot ask the phone by itself (issue #11).
  if (!activated()) {
    reply(id, {
      ok: false,
      name: 'NotAllowedError',
      message: 'a passkey request needs a click or a key press on the page',
    })
    return
  }
  if (open.size > 0) {
    reply(id, { ok: false, name: 'NotAllowedError', message: 'a passkey request is pending' })
    return
  }
  let port: chrome.runtime.Port
  try {
    port = chrome.runtime.connect({ name: 'passkey' })
  } catch {
    // The extension was updated or removed; this page's script is stale.
    reply(id, { ok: false, name: 'NotAllowedError', message: 'Nodkey is not available' })
    return
  }
  open.set(id, port)
  port.onMessage.addListener((r: PasskeyReply) => {
    open.delete(id)
    port.disconnect()
    reply(id, r)
  })
  port.onDisconnect.addListener(() => {
    if (!open.delete(id)) return
    reply(id, { ok: false, name: 'NotAllowedError', message: 'Nodkey stopped the request' })
  })
  const out: PasskeyPortMessage = { call: msg.call, sameOriginAncestors: sameOriginAncestors() }
  port.postMessage(out)
})

window.addEventListener(PAGE_CANCEL, (e) => {
  const msg = parse(e)
  const port = msg ? open.get(msg.id) : undefined
  if (!msg || !port) return
  open.delete(msg.id)
  port.disconnect()
})
