<script lang="ts" setup>
import { HoverButton } from '@/components/common'
import IconPrompt from '@/icons/Prompt.vue'
import { useAppStore, useChatStore } from '@/store'

defineProps<Props>()

const emit = defineEmits<Emit>()

interface Props {
  usingContext?: boolean
  showPrompt: boolean
}

interface Emit {
  (ev: 'export'): void
  (ev: 'toggleShowPrompt'): void
}

const appStore = useAppStore()
const chatStore = useChatStore()

const collapsed = computed(() => appStore.siderCollapsed)
const currentChatHistory = computed(() => chatStore.getChatRoomByCurrentActive)

function handleUpdateCollapsed() {
  appStore.setSiderCollapsed(!collapsed.value)
}

function onScrollToTop() {
  const scrollRef = document.querySelector('#scrollRef')
  if (scrollRef)
    nextTick(() => scrollRef.scrollTop = 0)
}

function handleExport() {
  emit('export')
}

function handleShowPrompt() {
  emit('toggleShowPrompt')
}
</script>

<template>
  <header
    class="sticky top-0 left-0 right-0 z-30 border-b dark:border-neutral-800 bg-white/80 dark:bg-black/20 backdrop-blur-sm"
  >
    <div class="relative flex items-center justify-between min-w-0 overflow-hidden h-14">
      <div class="flex items-center">
        <button
          class="flex items-center justify-center w-11 h-11"
          @click="handleUpdateCollapsed"
        >
          <IconRiAlignJustify v-if="collapsed" class="text-2xl" />
          <IconRiAlignRight v-else class="text-2xl" />
        </button>
      </div>
      <h1
        class="flex-1 px-4 pr-6 overflow-hidden cursor-pointer select-none text-ellipsis whitespace-nowrap"
        @dblclick="onScrollToTop"
      >
        {{ currentChatHistory?.title ?? '' }}
      </h1>
      <div class="flex items-center space-x-2">
        <HoverButton @click="handleShowPrompt">
          <span class="text-xl" :class="{ 'text-[#2f9e44]': usingContext, 'text-[#c92a2a]': !usingContext }">
            <IconPrompt class="w-[20px] m-auto" />
          </span>
        </HoverButton>
        <HoverButton @click="handleExport">
          <span class="text-xl text-[#4f555e] dark:text-white">
            <IconRiDownload2Line />
          </span>
        </HoverButton>
      </div>
    </div>
  </header>
</template>
