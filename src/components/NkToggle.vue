<script setup lang="ts">
/** A switch with its label (Flis: 46×28, accent when on). */
import { useId } from 'vue'

defineProps<{ label: string; help?: string }>()
const model = defineModel<boolean>({ required: true })
const id = useId()
</script>

<template>
  <div class="flex items-start gap-3">
    <div class="grid flex-1 gap-0.5">
      <label :for="id" class="text-sm">{{ label }}</label>
      <p v-if="help" :id="`${id}-help`" class="text-xs text-muted">{{ help }}</p>
    </div>
    <button
      :id="id"
      type="button"
      role="switch"
      :aria-checked="model"
      :aria-describedby="help ? `${id}-help` : undefined"
      class="relative h-7 w-[46px] flex-none rounded-full transition-colors"
      :class="model ? 'bg-accent' : 'bg-rule'"
      @click="model = !model"
    >
      <span
        class="absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform"
        :class="{ 'translate-x-[18px]': model }"
      />
    </button>
  </div>
</template>
