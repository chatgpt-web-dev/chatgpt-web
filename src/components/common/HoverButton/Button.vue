<script setup lang='ts'>
interface Emit {
  (e: 'click'): void
}

const emit = defineEmits<Emit>()

function handleClick() {
  emit('click')
}
</script>

<template>
  <button
    class="flex items-center justify-center h-10 transition hover:bg-neutral-100 dark:hover:bg-[#414755]"
    style="flex-flow:row nowrap;min-width:2.5em;padding:.5em;border-radius:.5em;"
    @click="handleClick"
  >
    <slot />
  </button>
</template>
