<script setup lang="ts">
/** The Nodkey mark and name, as at the top of the iPhone app. */
import { t } from '../i18n/t'
</script>

<template>
  <header class="flex items-center gap-2.5">
    <img src="/icons/logo.svg" alt="" width="26" height="26" class="rounded-[7px]" />
    <span class="font-display text-[17px] font-medium">{{ t('extName') }}</span>
    <span class="flex-1" />
    <slot />
  </header>
</template>
