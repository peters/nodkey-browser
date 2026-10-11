/** The background's status for a tab, kept current while the page is open. */

import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { Status } from '../models/messages'
import { status } from '../services/background'

export function useStatus(tabId: () => number | undefined) {
  const current = shallowRef<Status | null>(null)
  const error = ref<string | null>(null)
  let loading: Promise<void> | null = null
  let again = false
  // Read through a function: a load in progress may set it.
  const askedAgain = () => again

  async function load(): Promise<void> {
    // One load at a time; a change during a load asks for one more, so the last state wins.
    if (loading) {
      again = true
      return loading
    }
    loading = (async () => {
      do {
        again = false
        try {
          current.value = await status(tabId())
          error.value = null
        } catch (e) {
          error.value = e instanceof Error ? e.message : String(e)
        }
      } while (askedAgain())
    })()
    try {
      await loading
    } finally {
      loading = null
    }
  }

  const onChanged = () => {
    void load()
  }

  onMounted(() => {
    chrome.storage.onChanged.addListener(onChanged)
    void load()
  })
  onBeforeUnmount(() => {
    chrome.storage.onChanged.removeListener(onChanged)
  })

  return { status: current, error, reload: load }
}
