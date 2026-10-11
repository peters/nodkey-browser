/** The one channel from the extension's pages to the background. */

import type { Reply, Status, ToBackground } from '../models/messages'

export class BackgroundError extends Error {
  override name = 'BackgroundError'
}

export async function call<T>(msg: ToBackground): Promise<T> {
  const reply = await chrome.runtime.sendMessage<ToBackground, Reply<T> | undefined>(msg)
  if (!reply) throw new BackgroundError('no answer from the background')
  if (!reply.ok) throw new BackgroundError(reply.error)
  return reply.value
}

/** The tab the popup belongs to (the active tab of the current window). */
export async function activeTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  return tab?.id
}

export function status(tabId: number | undefined): Promise<Status> {
  return call<Status>(tabId === undefined ? { type: 'status' } : { type: 'status', tabId })
}
