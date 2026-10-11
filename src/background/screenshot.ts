/**
 * A picture of the visible part of a tab for the notification on the phone. It is sealed to the
 * phone before it leaves the browser; the relay only sees ciphertext.
 */

import type { Picture } from './agent'

/** Largest image the relay accepts after sealing (1 MiB minus `enc` and the tag). */
export const MAX_IMAGE_BYTES = 1_048_576 - 32 - 16
const MAX_WIDTH = 1280

function dataUrlBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

/** Scales a JPEG down to at most `MAX_WIDTH` pixels wide, at the given quality. */
async function shrink(bytes: Uint8Array, quality: number): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }))
  const scale = Math.min(1, MAX_WIDTH / bitmap.width)
  const canvas = new OffscreenCanvas(
    Math.round(bitmap.width * scale),
    Math.round(bitmap.height * scale),
  )
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no 2D canvas')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality })
  return new Uint8Array(await blob.arrayBuffer())
}

/** A JPEG of the tab's visible area within the size limit, or `null` when it cannot be taken. */
export async function capture(windowId: number, caption: string): Promise<Picture | null> {
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 70 })
    let bytes = dataUrlBytes(dataUrl)
    for (const quality of [0.7, 0.5, 0.35]) {
      if (bytes.length <= MAX_IMAGE_BYTES) break
      bytes = await shrink(bytes, quality)
    }
    if (bytes.length > MAX_IMAGE_BYTES) return null
    return { type: 'image/jpeg', bytes, caption }
  } catch {
    // No permission for this page, or the tab is not visible: send the request without it.
    return null
  }
}
