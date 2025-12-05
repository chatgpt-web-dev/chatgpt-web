<script lang="ts" setup>
import { useBasicLayout } from '@/hooks/useBasicLayout'
import Spinner from '@/icons/Spinner.vue'

const props = defineProps<Props>()

const { t } = useI18n()

interface Props {
  reasoning?: string
  reasonEnd?: boolean
  loading?: boolean
}

const { isMobile } = useBasicLayout()
const instance = getCurrentInstance()
const uid = instance?.uid || Date.now() + Math.random().toString(36).substring(2)

const textRef = ref<HTMLElement>()
const isCollapsed = ref(false)

const reasoningBtnTitle = computed(() => {
  return t('chat.expandCollapseReasoningProcess')
})

const shouldShowThinkingIndicator = computed(() => {
  return props.loading && !props.reasonEnd
})

const hasReasoningText = computed(() => {
  return props.reasoning && props.reasoning.trim() !== ''
})

const headerComputedClass = computed(() => {
  return [
    'flex items-center justify-between',
    'p-2 pl-3  w-48',
    'bg-gray-200 dark:bg-slate-700',
    'text-xs select-none font-medium',
    'transition-all duration-200 ease-in-out',
    hasReasoningText.value ? 'cursor-pointer hover:bg-gray-300 dark:hover:bg-slate-600' : 'cursor-default',
    (isCollapsed.value || !hasReasoningText.value) ? 'rounded-md' : 'rounded-t-md',
    isMobile.value ? 'max-w-full' : 'max-w-md',
    'shadow-xs',
  ]
})

const contentWrapperComputedClass = computed(() => {
  return [
    'overflow-hidden',
    'transition-all duration-300 ease-in-out',
    (isCollapsed.value || !hasReasoningText.value) ? 'max-h-0 opacity-0' : 'opacity-100',
  ]
})

const actualContentComputedClass = computed(() => {
  return [
    'p-3',
    'bg-gray-50 dark:bg-slate-800',
    'rounded-b-md shadow-xs',
    'text-xs leading-relaxed break-words',
    'prose prose-sm dark:prose-invert max-w-none',
  ]
})

function toggleCollapse() {
  if (hasReasoningText.value)
    isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <div class="my-2">
    <div
      :class="headerComputedClass"
      :role="hasReasoningText ? 'button' : undefined"
      :tabindex="hasReasoningText ? 0 : -1"
      :aria-expanded="hasReasoningText ? !isCollapsed : undefined"
      :aria-controls="hasReasoningText ? `reasoning-details-${uid}` : undefined"
      @click="hasReasoningText ? toggleCollapse() : null"
      @keydown.enter="hasReasoningText ? toggleCollapse() : null"
      @keydown.space="hasReasoningText ? toggleCollapse() : null"
    >
      <div class="flex items-center pr-2">
        <template v-if="shouldShowThinkingIndicator">
          <Spinner class="mr-2 h-4 w-4 text-blue-500 dark:text-blue-400" />
          <span class="text-gray-700 dark:text-gray-200 truncate">{{ t('chat.thinking') }}</span>
          <span v-if="hasReasoningText" class="mx-1.5 text-gray-400 dark:text-gray-500">|</span>
        </template>
        <span v-if="hasReasoningText" class="text-gray-800 dark:text-gray-100 truncate">{{ t('chat.reasoningProcess') }}</span>
        <span v-else-if="!shouldShowThinkingIndicator && !hasReasoningText" class="text-gray-500 dark:text-gray-400">({{ t('chat.noReasoningProcess') }})</span>
      </div>
      <button
        v-if="hasReasoningText"
        type="button"
        class="ml-auto flex items-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 focus:outline-hidden p-1 shrink-0 rounded-full hover:bg-gray-300 dark:hover:bg-slate-600"
        :aria-expanded="!isCollapsed"
        :aria-controls="`reasoning-details-${uid}`"
        :title="reasoningBtnTitle"
        @click.stop="toggleCollapse"
        @keydown.enter.stop="toggleCollapse"
        @keydown.space.stop="toggleCollapse"
      >
        <svg
          class="w-4 h-4 transform transition-transform duration-200"
          :class="{ 'rotate-180': !isCollapsed }"
          fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
    </div>

    <div :class="contentWrapperComputedClass">
      <div
        v-if="hasReasoningText"
        :id="`reasoning-details-${uid}`"
        ref="textRef"
        :class="actualContentComputedClass"
        role="region"
        :aria-hidden="isCollapsed"
      >
        <div class="w-full" v-text="props.reasoning" />
      </div>
    </div>
  </div>
</template>

<style lang="less">
@import url(./style.less);
</style>
