<script setup lang="ts">
/** Pairing: pick the name the phone shows, type the code on the phone, compare check numbers. */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import NkButton from '../../components/NkButton.vue'
import NkCard from '../../components/NkCard.vue'
import NkField from '../../components/NkField.vue'
import StatusLine from '../../components/StatusLine.vue'
import { t } from '../../i18n/t'
import type { PairingState } from '../../models/messages'
import { call } from '../../services/background'

const props = defineProps<{ pairing: PairingState; defaultName: string }>()
const name = ref(props.defaultName)
const sending = ref(false)
const error = ref<string | null>(null)
const now = ref(Date.now())
const clock = window.setInterval(() => (now.value = Date.now()), 1000)
onBeforeUnmount(() => {
  window.clearInterval(clock)
})

watch(
  () => props.defaultName,
  (n) => {
    if (props.pairing.state === 'idle') name.value = n
  },
)

const minutesLeft = computed(() =>
  props.pairing.state === 'waiting'
    ? String(Math.max(1, Math.ceil((props.pairing.expiresAt - now.value) / 60_000)))
    : '5',
)

async function run(msg: Parameters<typeof call>[0]) {
  sending.value = true
  error.value = null
  try {
    await call(msg)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <NkCard v-if="pairing.state === 'idle' || pairing.state === 'error'" :label="t('pairTitle')">
    <p>{{ t('pairIntro') }}</p>
    <StatusLine v-if="pairing.state === 'error'" state="error" :message="pairing.message" />
    <NkField v-model="name" :label="t('pairName')" :maxlength="64" />
    <NkButton
      :busy="sending"
      :disabled="!name.trim()"
      data-testid="pair-start"
      @click="run({ type: 'pair.start', name })"
    >
      {{ t('pairStart') }}
    </NkButton>
    <StatusLine v-if="error" state="error" :message="error" />
  </NkCard>

  <NkCard v-else-if="pairing.state === 'starting'" :label="t('pairTitle')">
    <StatusLine state="waiting" :message="t('loading')" />
  </NkCard>

  <NkCard v-else-if="pairing.state === 'waiting'" :label="t('pairTitle')" :tile="1">
    <p>{{ t('pairCodeHelp') }}</p>
    <p
      class="text-center font-display text-[34px] leading-none font-extrabold tracking-[0.04em] tabular-nums"
      data-testid="pairing-code"
    >
      {{ pairing.code }}
    </p>
    <StatusLine
      state="waiting"
      :message="t('pairWaiting')"
      :hint="t('pairCodeValid', minutesLeft)"
    />
    <NkButton variant="plain" @click="run({ type: 'pair.cancel' })">{{ t('pairCancel') }}</NkButton>
  </NkCard>

  <NkCard v-else-if="pairing.state === 'check'" :label="t('pairCheckTitle')" :tile="3">
    <p>{{ t('pairAnswered', pairing.phoneName) }} {{ t('pairCheckHelp') }}</p>
    <div class="text-center">
      <p class="text-xs text-muted">{{ t('pairCheckLabel') }}</p>
      <p
        class="font-display text-[34px] leading-none font-extrabold tabular-nums"
        data-testid="check-number"
      >
        {{ pairing.check }}
      </p>
    </div>
    <div class="grid grid-cols-2 gap-2">
      <NkButton :busy="sending" data-testid="pair-confirm" @click="run({ type: 'pair.confirm' })">
        {{ t('pairCheckSame') }}
      </NkButton>
      <NkButton
        variant="danger"
        :disabled="sending"
        data-testid="pair-reject"
        @click="run({ type: 'pair.reject' })"
      >
        {{ t('pairCheckDifferent') }}
      </NkButton>
    </div>
  </NkCard>
</template>
