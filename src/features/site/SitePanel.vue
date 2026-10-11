<script setup lang="ts">
/** The site in the current tab: fill its login or code, and the state of the last request. */
import { computed } from 'vue'
import NkButton from '../../components/NkButton.vue'
import NkCard from '../../components/NkCard.vue'
import StatusLine from '../../components/StatusLine.vue'
import { t } from '../../i18n/t'
import type { Activity } from '../../models/messages'
import { call } from '../../services/background'

const props = defineProps<{
  site: string | null
  canFill: boolean
  activity: Activity | null
  tabId: number | undefined
}>()

const waiting = computed(() => props.activity?.state === 'waiting')
const monogram = computed(() => (props.site ?? '?').slice(0, 1).toUpperCase())

function fill(type: 'fill.login' | 'fill.code') {
  if (props.tabId === undefined) return
  void call({ type, tabId: props.tabId })
}
</script>

<template>
  <NkCard v-if="!site">
    <p class="text-muted">{{ t('siteNone') }}</p>
  </NkCard>
  <NkCard v-else :tile="1">
    <div class="flex items-center gap-3">
      <span
        class="grid size-7 flex-none place-items-center rounded-full bg-card font-display text-[13px] font-extrabold"
        aria-hidden="true"
        >{{ monogram }}</span
      >
      <span class="truncate font-display text-[17px] font-bold" data-testid="site">{{ site }}</span>
    </div>
    <p v-if="!canFill" class="text-sm text-low">{{ t('siteInsecure') }}</p>
    <div class="grid grid-cols-2 gap-2">
      <NkButton
        :disabled="!canFill || waiting"
        data-testid="fill-login"
        @click="fill('fill.login')"
      >
        {{ t('fillLogin') }}
      </NkButton>
      <NkButton
        variant="plain"
        :disabled="!canFill || waiting"
        data-testid="fill-code"
        @click="fill('fill.code')"
      >
        {{ t('fillCode') }}
      </NkButton>
    </div>
    <StatusLine
      v-if="activity"
      :state="activity.state"
      :message="activity.message"
      :hint="activity.state === 'waiting' ? t('actWaitingHint') : undefined"
    />
  </NkCard>
</template>
