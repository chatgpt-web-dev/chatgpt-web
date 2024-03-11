<script setup lang='ts'>
import type { CSSProperties } from 'vue'
import { computed, onMounted, ref, watch } from 'vue'
import { NButton, NLayoutSider, NModal, NSpace } from 'naive-ui'
import MarkdownIt from 'markdown-it'
import mdKatex from '@traptitech/markdown-it-katex'
import mila from 'markdown-it-link-attributes'
import hljs from 'highlight.js'
import List from './List.vue'
import Footer from './Footer.vue'
import { GithubSite, HoverButton, PromptStore, SvgIcon } from '@/components/common'
import { useAppStore, useAuthStore, useChatStore } from '@/store'
import { useBasicLayout } from '@/hooks/useBasicLayout'

const appStore = useAppStore()
const authStore = useAuthStore()
const chatStore = useChatStore()

const { isMobile } = useBasicLayout()
const show = ref(false)

const collapsed = computed(() => appStore.siderCollapsed)

// for notice window markdown syntax reader borrowed from ./Text.vue maybe set to reuseable in the future
const mdi = new MarkdownIt({
  html: false,
  linkify: true,
  highlight(code, language) {
    const validLang = !!(language && hljs.getLanguage(language))
    if (validLang) {
      const lang = language ?? ''
      return highlightBlock(hljs.highlight(code, { language: lang }).value, lang)
    }
    return highlightBlock(hljs.highlightAuto(code).value, '')
  },
})

mdi.use(mila, { attrs: { target: '_blank', rel: 'noopener' } })
mdi.use(mdKatex, { blockClass: 'katexmath-block rounded-md p-[10px]', errorColor: ' #cc0000' })

let readmeContent = {
    date: '2024-03-09',
    contents: '### Blank',
}
const notice_text = ref('')

const showNotice = ref(false)

function highlightBlock(str: string, lang?: string) {
  return `<pre class="code-block-wrapper"><div class="code-block-header"><span class="code-block-header__lang">${lang}</span></div><code class="hljs code-block-body ${lang}">${str}</code></pre>`
}

function handleNotice() {
  showNotice.value = true
}

async function fetchJsonData() {
    try {
      const response = await fetch('/notice.json')
      readmeContent = await response.json()
    }
 catch (error) {
      console.error('Error loading Notice JSON file:', error)
    }
  };

async function handleAdd() {
  await chatStore.addNewHistory()
  if (isMobile.value)
    appStore.setSiderCollapsed(true)
}

function handleUpdateCollapsed() {
  appStore.setSiderCollapsed(!collapsed.value)
}

const getMobileClass = computed<CSSProperties>(() => {
  if (isMobile.value) {
    return {
      position: 'fixed',
      zIndex: 50,
    }
  }
  return {}
})

const mobileSafeArea = computed(() => {
  if (isMobile.value) {
    return {
      paddingBottom: 'env(safe-area-inset-bottom)',
    }
  }
  return {}
})

watch(
  isMobile,
  (val) => {
    appStore.setSiderCollapsed(val)
  },
  {
    immediate: true,
    flush: 'post',
  },
)

onMounted(async () => {
  await fetchJsonData()
  notice_text.value = mdi.render(readmeContent.contents)
  showNotice.value = true
})
</script>

<template>
  <NLayoutSider
    :collapsed="collapsed"
    :collapsed-width="0"
    :width="260"
    :show-trigger="isMobile ? false : 'arrow-circle'"
    collapse-mode="transform"
    position="absolute"
    bordered
    :style="getMobileClass"
    @update-collapsed="handleUpdateCollapsed"
  >
    <div class="flex flex-col h-full" :style="mobileSafeArea">
      <main class="flex flex-col flex-1 min-h-0">
        <div class="p-4">
          <NButton dashed block :disabled="!!authStore.session?.auth && !authStore.token && !authStore.session?.authProxyEnabled" @click="handleAdd">
            {{ $t('chat.newChatButton') }}
          </NButton>
        </div>
        <div class="flex-1 min-h-0 pb-4 overflow-hidden">
          <List />
        </div>
        <div class="p-4">
          <NSpace justify="space-between">
            <NButton block @click="show = true">
              {{ $t('store.siderButton') }}
            </NButton>
            <HoverButton @click="handleNotice">
              <span class="text-xl text-[#4f555e] dark:text-white">
                <SvgIcon icon="gg:info" />
              </span>
            </HoverButton>
          </NSpace>
        </div>
      </main>
      <Footer />
      <GithubSite class="flex-col-2 text-center m-0" />
    </div>
  </NLayoutSider>
  <template v-if="isMobile">
    <div v-show="!collapsed" class="fixed inset-0 z-40 bg-black/40" @click="handleUpdateCollapsed" />
  </template>
  <PromptStore v-model:visible="show" />
  <NModal v-model:show="showNotice" :auto-focus="false" preset="card" :style="{ width: !isMobile ? '33%' : '90%' }">
    <div class="p-4 space-y-5 min-h-[200px]">
      <div class="w-full markdown-body" v-html="notice_text" />
    </div>
  </NModal>
</template>
