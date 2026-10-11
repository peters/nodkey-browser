<script setup lang="ts">
/** Logins that wait to be saved on the phone (their passwords are sealed to the phone). */
import NkButton from '../../components/NkButton.vue'
import NkCard from '../../components/NkCard.vue'
import { t } from '../../i18n/t'
import type { SaveOffer } from '../../models/messages'
import { call } from '../../services/background'

const props = defineProps<{ pending: SaveOffer[]; tabId: number | undefined }>()

function retry(id: string) {
  void call(
    props.tabId === undefined
      ? { type: 'save.retry', id }
      : { type: 'save.retry', id, tabId: props.tabId },
  )
}
</script>

<template>
  <NkCard v-if="pending.length > 0" :label="t('pendingTitle')">
    <ul class="grid gap-3">
      <li v-for="offer in pending" :key="offer.id" class="grid gap-2" data-testid="pending-save">
        <div>
          <p class="font-display text-[14px] font-bold">{{ offer.site }}</p>
          <p class="truncate text-xs text-muted">{{ offer.username }}</p>
        </div>
        <div class="flex gap-2">
          <NkButton @click="retry(offer.id)">{{ t('pendingRetry') }}</NkButton>
          <NkButton variant="plain" @click="call({ type: 'save.discard', id: offer.id })">
            {{ t('pendingDiscard') }}
          </NkButton>
        </div>
      </li>
    </ul>
  </NkCard>
</template>
