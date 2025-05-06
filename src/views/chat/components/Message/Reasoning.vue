<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useBasicLayout } from '@/hooks/useBasicLayout'

interface Props {
  reasoning?: string
  loading?: boolean
}

defineProps<Props>()

const { isMobile } = useBasicLayout()

const textRef = ref<HTMLElement>()

const wrapClass = computed(() => {
  return [
    'text-wrap',
    'min-w-[20px]',
    'rounded-md',
    isMobile.value ? 'p-2' : 'px-3 py-2',
  ]
})
</script>

<template>
  <div class="text-black" :class="wrapClass">
    <div ref="textRef" class="leading-relaxed break-words">
      <div class="flex items-end">
        <div class="w-full dark:text-gray-50 text-xs" v-text="reasoning" />
      </div>
    </div>
  </div>
</template>

<style lang="less">
@import url(./style.less);
</style>
