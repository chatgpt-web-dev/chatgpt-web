<script setup lang='ts'>
import type { CSSProperties } from 'vue'
import type { AnnounceConfig } from '@/components/common/Setting/model'
import { fetchAnnouncement } from '@/api'
import { GithubSite, PromptStore, Watermark } from '@/components/common'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAppStore, useAuthStore, useChatStore } from '@/store'
import Footer from './Footer.vue'
import List from './List.vue'

const { t } = useI18n()

const config = ref<AnnounceConfig>()

const appStore = useAppStore()
const authStore = useAuthStore()
const chatStore = useChatStore()

const { isMobile } = useBasicLayout()
const show = ref(false)

const collapsed = computed(() => appStore.siderCollapsed)

async function handleAdd() {
  await chatStore.addNewChatRoom()
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

const notice_text = ref('')
const showNotice = ref(false)

function closeModal() {
  showNotice.value = false
}

function doNotShowToday() {
  const today = new Date().toDateString()
  localStorage.setItem('announcementLastClosed', today)
  closeModal()
}

function checkDoNotShowToday() {
  const today = new Date().toDateString()
  const lastClosed = localStorage.getItem('announcementLastClosed')
  if (lastClosed === today)
    showNotice.value = false
}

async function fetchAnnounce() {
  try {
    // 从数据库获取公告配置
    const { data } = await fetchAnnouncement()
    config.value = data
    if (config.value) {
      if (config.value.enabled)
        showNotice.value = true
      checkDoNotShowToday()
      return config.value
    }
  }
  catch (error) {
    console.error('Error fetching the announcement:', error)
  }
}

onMounted(async () => {
  const data = await fetchAnnounce()
  notice_text.value = `${data?.announceWords}`
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
            {{ t('chat.newChatButton') }}
          </NButton>
        </div>
        <div class="flex-1 min-h-0 pb-4 overflow-hidden">
          <List />
        </div>
        <div class="p-4">
          <NButton block @click="show = true">
            {{ t('store.siderButton') }}
          </NButton>
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
    <div class="buttons-container">
      <div class="button-wrapper">
        <NButton type="primary" @click="closeModal">
          关闭公告
        </NButton>
      </div>
      <div class="button-wrapper">
        <NButton type="default" @click="doNotShowToday">
          今日不再提示
        </NButton>
      </div>
    </div>
  </NModal>
  <Watermark v-if="authStore.session?.showWatermark" />
</template>

<style scoped>
.buttons-container {
  display: flex;
  justify-content: flex-end;
  align-items: flex-end;
}

.button-wrapper {
  margin-left: 10px;
}
</style>
