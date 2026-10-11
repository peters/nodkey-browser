<script setup lang="ts">
/** A labelled text field (Flis: small muted label above a card-coloured input). */
import { useId } from 'vue'

defineProps<{ label: string; help?: string; type?: 'text' | 'url'; maxlength?: number }>()
const model = defineModel<string>({ required: true })
const id = useId()
</script>

<template>
  <div class="grid gap-1">
    <label :for="id" class="text-xs text-muted">{{ label }}</label>
    <input
      :id="id"
      v-model="model"
      :type="type ?? 'text'"
      :maxlength="maxlength"
      :aria-describedby="help ? `${id}-help` : undefined"
      class="min-h-11 rounded-field border border-rule bg-card px-2.5 text-sm text-ink"
    />
    <p v-if="help" :id="`${id}-help`" class="text-xs text-muted">{{ help }}</p>
  </div>
</template>
