<script setup lang="ts">
/** The settings page: this browser's name, the paired phone, requests, saving and the relay. */
import { ref, watch } from 'vue'
import BrandHeader from '../../components/BrandHeader.vue'
import NkButton from '../../components/NkButton.vue'
import NkCard from '../../components/NkCard.vue'
import NkField from '../../components/NkField.vue'
import NkToggle from '../../components/NkToggle.vue'
import StatusLine from '../../components/StatusLine.vue'
import PairingPanel from '../../features/pairing/PairingPanel.vue'
import { useStatus } from '../../composables/useStatus'
import { t } from '../../i18n/t'
import type { Settings } from '../../models/messages'
import { call } from '../../services/background'
import { browserInfo } from '../../utils/browser'
import { relayAddressOk } from '../../utils/relay'

const { status, error, reload } = useStatus(() => undefined)
// Safari grants website access in its own settings: permissions.request shows nothing there.
const safari = browserInfo(navigator.userAgent).browser === 'Safari'
type Section = 'name' | 'phone' | 'requests' | 'saving' | 'relay'

const name = ref('')
const relay = ref('')
// What the person typed is kept; the fields follow the background until then.
const nameEdited = ref(false)
const relayEdited = ref(false)
/** Feedback shows in the section where the person acted. */
const feedback = ref<{ section: Section; ok: boolean; text: string } | null>(null)

watch(status, (s) => {
  if (!s) return
  if (!nameEdited.value) name.value = s.agentName ?? ''
  if (!relayEdited.value) relay.value = s.settings.relay
})

function said(section: Section) {
  return feedback.value?.section === section ? feedback.value : null
}

async function act(section: Section, msg: Parameters<typeof call>[0], saved = true) {
  feedback.value = null
  try {
    await call(msg)
    if (saved) feedback.value = { section, ok: true, text: t('optSaved') }
    if (section === 'name') nameEdited.value = false
    if (section === 'relay') relayEdited.value = false
    await reload()
  } catch (e) {
    feedback.value = { section, ok: false, text: e instanceof Error ? e.message : String(e) }
  }
}

function set(section: Section, patch: Partial<Settings>) {
  void act(section, { type: 'settings.set', patch }, false)
}

async function grantAccess() {
  await chrome.permissions.request({ origins: ['<all_urls>'] })
  await reload()
}

function saveRelay() {
  if (!relayAddressOk(relay.value)) {
    feedback.value = { section: 'relay', ok: false, text: t('optRelayHttps') }
    return
  }
  void act('relay', { type: 'settings.set', patch: { relay: relay.value.trim() } })
}
</script>

<template>
  <main class="mx-auto grid max-w-xl gap-5 px-4 py-6">
    <BrandHeader />
    <h1 class="font-display text-[34px] leading-[1.05] font-medium">{{ t('optTitle') }}</h1>
    <StatusLine v-if="error" state="error" :message="t('actError', error)" />
    <StatusLine v-else-if="!status" state="waiting" :message="t('loading')" />
    <template v-else>
      <PairingPanel
        v-if="status.phones.length === 0 || status.pairing.state !== 'idle'"
        :pairing="status.pairing"
        :default-name="status.agentName ?? ''"
      />

      <NkCard v-if="!status.siteAccess" :label="t('optSiteAccess')" :tile="2">
        <p>{{ t('optSiteAccessHelp') }}</p>
        <p v-if="safari" data-testid="site-access-safari">{{ t('optSiteAccessSafari') }}</p>
        <NkButton v-else @click="grantAccess">{{ t('optSiteAccessGrant') }}</NkButton>
      </NkCard>

      <NkCard :label="t('optBrowser')">
        <NkField
          v-model="name"
          :label="t('optName')"
          :help="t('optNameHelp')"
          :maxlength="64"
          @update:model-value="nameEdited = true"
        />
        <NkButton
          variant="plain"
          :disabled="!name.trim()"
          @click="act('name', { type: 'agent.rename', name })"
        >
          {{ t('optNameSave') }}
        </NkButton>
        <StatusLine
          v-if="said('name')"
          :state="said('name')?.ok ? 'approved' : 'error'"
          :message="said('name')?.text ?? ''"
        />
      </NkCard>

      <NkCard v-if="status.phones.length > 0" :label="t('optPhone')">
        <div v-for="phone in status.phones" :key="phone.phone_id" class="grid gap-2">
          <div class="flex items-center gap-3">
            <span
              class="grid size-[34px] place-items-center rounded-[10px] bg-soft text-xs font-bold text-accent"
              aria-hidden="true"
              >{{ phone.name.slice(0, 2).toUpperCase() }}</span
            >
            <div class="flex-1">
              <p>{{ phone.name }}</p>
              <p class="text-[11.5px] text-muted">{{ t('pairCheckLabel') }} {{ phone.check }}</p>
            </div>
            <NkButton
              variant="danger"
              @click="act('phone', { type: 'unpair', phoneId: phone.phone_id }, false)"
            >
              {{ t('optUnpair') }}
            </NkButton>
          </div>
          <p class="text-xs text-muted">{{ t('optUnpairHelp') }}</p>
        </div>
        <StatusLine
          v-if="said('phone')"
          :state="said('phone')?.ok ? 'approved' : 'error'"
          :message="said('phone')?.text ?? ''"
        />
      </NkCard>

      <NkCard :label="t('optRequests')">
        <NkToggle
          :model-value="status.settings.screenshots"
          :label="t('optScreenshots')"
          :help="t('optScreenshotsHelp')"
          @update:model-value="set('requests', { screenshots: $event })"
        />
        <NkToggle
          :model-value="status.settings.passkeys"
          :label="t('optPasskeys')"
          :help="t('optPasskeysHelp')"
          @update:model-value="set('requests', { passkeys: $event })"
        />
        <StatusLine
          v-if="said('requests')"
          :state="said('requests')?.ok ? 'approved' : 'error'"
          :message="said('requests')?.text ?? ''"
        />
      </NkCard>

      <NkCard :label="t('optSaving')">
        <NkToggle
          :model-value="status.settings.offerSave"
          :label="t('optOfferSave')"
          @update:model-value="set('saving', { offerSave: $event })"
        />
        <div class="grid gap-1">
          <p class="text-xs text-muted">{{ t('optNeverSave') }}</p>
          <p v-if="status.settings.neverSave.length === 0" class="text-sm text-muted">
            {{ t('optNeverSaveNone') }}
          </p>
          <ul class="grid gap-1">
            <li
              v-for="site in status.settings.neverSave"
              :key="site"
              class="flex items-center justify-between gap-2"
            >
              <span>{{ site }}</span>
              <NkButton
                variant="plain"
                @click="
                  set('saving', { neverSave: status.settings.neverSave.filter((s) => s !== site) })
                "
              >
                {{ t('optRemove') }}
              </NkButton>
            </li>
          </ul>
        </div>
        <StatusLine
          v-if="said('saving')"
          :state="said('saving')?.ok ? 'approved' : 'error'"
          :message="said('saving')?.text ?? ''"
        />
      </NkCard>

      <NkCard :label="t('optAdvanced')">
        <NkField
          v-model="relay"
          type="url"
          :label="t('optRelay')"
          :help="t('optRelayHelp')"
          @update:model-value="relayEdited = true"
        />
        <NkButton variant="plain" @click="saveRelay">{{ t('optRelaySave') }}</NkButton>
        <StatusLine
          v-if="said('relay')"
          :state="said('relay')?.ok ? 'approved' : 'error'"
          :message="said('relay')?.text ?? ''"
        />
      </NkCard>
    </template>
  </main>
</template>
