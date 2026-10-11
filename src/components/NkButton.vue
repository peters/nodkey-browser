<script setup lang="ts">
/** The shared button: `primary` (accent fill), `plain` (accent text) or `danger`. */
withDefaults(
  defineProps<{
    variant?: 'primary' | 'plain' | 'danger'
    busy?: boolean
    disabled?: boolean
    type?: 'button' | 'submit'
  }>(),
  { variant: 'primary', busy: false, disabled: false, type: 'button' },
)
defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || busy"
    :aria-busy="busy || undefined"
    class="inline-flex min-h-11 items-center justify-center gap-2 rounded-button px-4 text-sm font-semibold transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
    :class="{
      'bg-accent text-on-accent': variant === 'primary',
      'border border-rule bg-transparent text-accent': variant === 'plain',
      'border border-rule bg-transparent text-destructive': variant === 'danger',
    }"
    @click="$emit('click', $event)"
  >
    <span
      v-if="busy"
      class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>
