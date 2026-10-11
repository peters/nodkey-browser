<script setup lang="ts">
/** The toolbar popup: pair, or fill the current site's login or code. */
import { computed, ref } from 'vue'
import BrandHeader from '../../components/BrandHeader.vue'
import StatusLine from '../../components/StatusLine.vue'
import PairingPanel from '../../features/pairing/PairingPanel.vue'
import PendingSaves from '../../features/saves/PendingSaves.vue'
import SitePanel from '../../features/site/SitePanel.vue'
import { useStatus } from '../../composables/useStatus'
import { t } from '../../i18n/t'

const props = defineProps<{ tabId: number | undefined }>()
const tab = ref(props.tabId)
const { status, error } = useStatus(() => tab.value)

const paired = computed(() => (status.value?.phones.length ?? 0) > 0)
const pairing = computed(() => status.value?.pairing ?? { state: 'idle' as const })
const showPairing = computed(() => !paired.value || pairing.value.state !== 'idle')

function openSettings() {
  void chrome.runtime.openOptionsPage()
}
</script>

<template>
  <main class="grid w-[360px] gap-3.5 p-4">
    <BrandHeader>
      <button
        type="button"
        class="min-h-11 rounded-button px-2 text-sm text-accent"
        @click="openSettings"
      >
        {{ t('settingsLink') }}
      </button>
    </BrandHeader>
    <StatusLine v-if="error" state="error" :message="t('actError', error)" />
    <StatusLine v-else-if="!status" state="waiting" :message="t('loading')" />
    <template v-else>
      <PairingPanel v-if="showPairing" :pairing="pairing" :default-name="status.agentName ?? ''" />
      <template v-if="paired">
        <SitePanel
          :site="status.site"
          :can-fill="status.canFill"
          :activity="status.activity"
          :tab-id="tab"
        />
        <PendingSaves :pending="status.pending" :tab-id="tab" />
      </template>
    </template>
  </main>
</template>
