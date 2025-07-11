<script lang="ts" setup>
import { useBasicLayout } from '@/hooks/useBasicLayout'

const props = defineProps<Props>()

const { t } = useI18n()

interface Props {
  searchQuery?: string
  searchResults?: Chat.SearchResult[]
  searchUsageTime?: number
  searchEnd?: boolean
  loading?: boolean
}

const { isMobile } = useBasicLayout()
const instance = getCurrentInstance()
const uid = instance?.uid || Date.now() + Math.random().toString(36).substring(2)

const textRef = ref<HTMLElement>()
const isCollapsed = ref(true)

const searchBtnTitle = computed(() => {
  return t('chat.expandCollapseSearchResults')
})

const shouldShowSearchingIndicator = computed(() => {
  return props.loading && !props.searchEnd
})

const hasSearchResults = computed(() => {
  return props.searchResults && props.searchResults.length > 0
})

const headerComputedClass = computed(() => {
  return [
    'flex items-center justify-between',
    'p-2 pl-3 w-fit',
    'bg-blue-100 dark:bg-green-300/30',
    'text-xs select-none font-medium',
    'transition-all duration-200 ease-in-out',
    hasSearchResults.value ? 'cursor-pointer hover:bg-blue-200 dark:hover:bg-green-100/40' : 'cursor-default',
    (isCollapsed.value || !hasSearchResults.value) ? 'rounded-md' : 'rounded-t-md',
    isMobile.value ? 'max-w-full' : 'max-w-full',
    'shadow-xs',
  ]
})

const contentWrapperComputedClass = computed(() => {
  return [
    'overflow-hidden',
    'transition-all duration-300 ease-in-out',
    (isCollapsed.value || !hasSearchResults.value) ? 'max-h-0 opacity-0' : 'max-h-none opacity-100',
  ]
})

const actualContentComputedClass = computed(() => {
  return [
    'p-3',
    'bg-blue-50 dark:bg-green-300/20',
    'rounded-b-md shadow-xs',
    'text-xs leading-relaxed break-words',
    'prose prose-sm dark:prose-invert max-w-none',
  ]
})

function toggleCollapse() {
  if (hasSearchResults.value)
    isCollapsed.value = !isCollapsed.value
}
</script>

<template>
  <div class="my-2">
    <div
      :class="headerComputedClass"
      :role="hasSearchResults ? 'button' : undefined"
      :tabindex="hasSearchResults ? 0 : -1"
      :aria-expanded="hasSearchResults ? !isCollapsed : undefined"
      :aria-controls="hasSearchResults ? `search-details-${uid}` : undefined"
      @click="hasSearchResults ? toggleCollapse() : null"
      @keydown.enter="hasSearchResults ? toggleCollapse() : null"
      @keydown.space="hasSearchResults ? toggleCollapse() : null"
    >
      <div class="flex items-center pr-2">
        <template v-if="shouldShowSearchingIndicator">
          <svg
            class="animate-spin mr-2 h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span class="text-blue-700 dark:text-blue-200 truncate">{{ t('chat.searching') }}</span>
          <span class="ml-1.5 mr-5 text-blue-400 dark:text-blue-500">|</span>
        </template>
        <span class="text-blue-800 dark:text-blue-100 truncate">{{ `${t('chat.searchQuery')}: ${searchQuery}` }}</span>
        <template v-if="searchUsageTime">
          <span class="mr-1.5 ml-5 text-blue-400 dark:text-blue-500">|</span>
          <span class="text-blue-600 dark:text-blue-300 truncate">{{ `${t('chat.searchUsageTime')}: ${searchUsageTime.toFixed(2)}s` }}</span>
        </template>
      </div>
      <button
        v-if="hasSearchResults"
        type="button"
        class="ml-auto flex items-center text-blue-500 dark:text-green-400 hover:text-blue-700 dark:hover:text-green-200 focus:outline-hidden p-1 shrink-0 rounded-full hover:bg-blue-200 dark:hover:bg-green-800/40"
        :aria-expanded="!isCollapsed"
        :aria-controls="`search-details-${uid}`"
        :title="searchBtnTitle"
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
        v-if="hasSearchResults"
        :id="`search-details-${uid}`"
        ref="textRef"
        :class="actualContentComputedClass"
        role="region"
        :aria-hidden="isCollapsed"
      >
        <div class="w-full space-y-3">
          <div
            v-for="(result, index) in props.searchResults"
            :key="index"
            class="border-l-2 border-blue-300 dark:border-blue-300 pl-3"
          >
            <div class="flex items-start justify-between mb-1">
              <a
                :href="result.url"
                target="_blank"
                rel="noopener noreferrer"
                class="text-blue-700 dark:text-red-200 hover:text-blue-900 dark:hover:text-blue-100 text-sm font-medium leading-tight block pr-2 hover:underline"
              >
                {{ result.title }}
              </a>
            </div>
            <p class="text-xs text-gray-700 dark:text-gray-300 leading-relaxed mb-1">
              {{ result.content }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="less">
@import url(./style.less);

.prose {
  code {
    background-color: rgba(147,197,253,0.3);
    padding: .2em .4em;
    margin: 0;
    font-size: 85%;
    border-radius: 3px;
  }
  pre {
    background-color: rgba(191,219,254,1);
    color: rgba(30,58,138,1);
    padding: 0.75rem;
    border-radius: 0.25rem;
    overflow-x: auto;
    code {
      background-color: transparent;
      padding: 0;
      margin: 0;
      font-size: inherit;
      border-radius: 0;
      color: inherit;
    }
  }
}
.dark .prose {
  color: rgba(191,219,254,1);
  code {
    background-color: rgba(30,58,138,0.5);
    color: rgba(219,234,254,1);
  }
  pre {
    background-color: rgba(30,64,175,0.3);
    color: rgba(219,234,254,1);
  }
}

.whitespace-pre-wrap {
  white-space: normal;
}
</style>
