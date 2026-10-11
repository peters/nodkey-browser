<script setup lang="ts">
/** A Flis group: a rounded card with an optional small uppercase label above it. */
defineProps<{ label?: string; tile?: 1 | 2 | 3 | 4 }>()
</script>

<template>
  <section class="grid gap-1.5">
    <h2
      v-if="label"
      class="px-1 text-[10.5px] font-semibold tracking-[0.08em] text-muted uppercase"
    >
      {{ label }}
    </h2>
    <div
      class="grid gap-3 rounded-tile p-4"
      :class="{
        'bg-card': !tile,
        'bg-tile1': tile === 1,
        'bg-tile2': tile === 2,
        'bg-tile3': tile === 3,
        'bg-tile4': tile === 4,
      }"
    >
      <slot />
    </div>
  </section>
</template>
