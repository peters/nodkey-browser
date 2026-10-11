<script setup lang="ts">
/** One line of state: a spinner while waiting, the message, and a hint below. */
defineProps<{
  state: 'waiting' | 'approved' | 'denied' | 'expired' | 'error'
  message: string
  hint?: string
}>()
</script>

<template>
  <div role="status" aria-live="polite" class="grid gap-1">
    <p class="flex items-start gap-2" :class="{ 'text-low': state === 'error' }">
      <span
        v-if="state === 'waiting'"
        class="mt-0.5 size-4 flex-none animate-spin rounded-full border-2 border-rule border-t-accent"
        aria-hidden="true"
      />
      <span>{{ message }}</span>
    </p>
    <p v-if="hint" class="text-xs text-muted">{{ hint }}</p>
  </div>
</template>
