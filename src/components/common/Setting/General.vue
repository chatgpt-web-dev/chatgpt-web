<script lang="ts" setup>
import { computed, ref } from 'vue'
import { NButton, NDivider, NInput, NPopconfirm, NSelect, NSlider, useMessage } from 'naive-ui'
import { UserConfig } from '@/components/common/Setting/model'
import type { Language, Theme } from '@/store/modules/app/helper'
import { SvgIcon } from '@/components/common'
import { useAppStore, useAuthStore, useUserStore } from '@/store'
import type { UserInfo } from '@/store/modules/user/helper'
import { getCurrentDate } from '@/utils/functions'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { fetchClearAllChat, fetchUpdateUserChatModel } from '@/api'

const appStore = useAppStore()
const userStore = useUserStore()
const authStore = useAuthStore()

const { isMobile } = useBasicLayout()

const ms = useMessage()

const theme = computed(() => appStore.theme)

const userInfo = computed(() => userStore.userInfo)

const avatar = ref(userInfo.value.avatar ?? '')

const systemRole = ref(userInfo.value.systemRole ?? '')

const temperature = ref(userInfo.value.temperature ?? 0.8)

const top_p = ref(userInfo.value.top_p ?? 0.9)

const presencePenalty = ref(userInfo.value.presencePenalty ?? 0.6)

const name = ref(userInfo.value.name ?? '')

const description = ref(userInfo.value.description ?? '')

const language = computed({
  get() {
    return appStore.language
  },
  set(value: Language) {
    appStore.setLanguage(value)
  },
})

const themeOptions: { label: string; key: Theme; icon: string }[] = [
  {
    label: 'Auto',
    key: 'auto',
    icon: 'ri:contrast-line',
  },
  {
    label: 'Light',
    key: 'light',
    icon: 'ri:sun-foggy-line',
  },
  {
    label: 'Dark',
    key: 'dark',
    icon: 'ri:moon-foggy-line',
  },
]

const languageOptions: { label: string; key: Language; value: Language }[] = [
  { label: '简体中文', key: 'zh-CN', value: 'zh-CN' },
  { label: '繁體中文', key: 'zh-TW', value: 'zh-TW' },
  { label: 'English', key: 'en-US', value: 'en-US' },
  { label: '한국어', key: 'ko-KR', value: 'ko-KR' },
]

async function updateUserInfo(options: Partial<UserInfo>) {
  await userStore.updateUserInfo(true, options)
  ms.success(t('common.success'))
}

async function updateUserChatModel(chatModel: string) {
  if (!userStore.userInfo.config)
    userStore.userInfo.config = new UserConfig()
  userStore.userInfo.config.chatModel = chatModel
  userStore.recordState()
  await fetchUpdateUserChatModel(chatModel)
}

function exportData(): void {
  const date = getCurrentDate()
  const data: string = localStorage.getItem('chatStorage') || '{}'
  const jsonString: string = JSON.stringify(JSON.parse(data), null, 2)
  const blob: Blob = new Blob([jsonString], { type: 'application/json' })
  const url: string = URL.createObjectURL(blob)
  const link: HTMLAnchorElement = document.createElement('a')
  link.href = url
  link.download = `chat-store_${date}.json`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

function importData(event: Event): void {
  const target = event.target as HTMLInputElement
  if (!target || !target.files)
    return

  const file: File = target.files[0]
  if (!file)
    return

  const reader: FileReader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result as string)
      localStorage.setItem('chatStorage', JSON.stringify(data))
      ms.success(t('common.success'))
      location.reload()
    }
    catch (error) {
      ms.error(t('common.invalidFileFormat'))
    }
  }
  reader.readAsText(file)
}

async function clearData(): Promise<void> {
  await fetchClearAllChat()
  localStorage.removeItem('chatStorage')
  location.reload()
}

function handleImportButtonClick(): void {
  const fileInput = document.getElementById('fileInput') as HTMLElement
  if (fileInput)
    fileInput.click()
}
</script>

<template>
  <div class="p-4 space-y-5 min-h-[200px]">
    <div class="space-y-6">
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.name') }}</span>
        <div class="w-[200px]">
          <NInput v-model:value="name" placeholder="" />
        </div>
      </div>
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.description') }}</span>
        <div class="flex-1">
          <NInput v-model:value="description" placeholder="" />
        </div>
      </div>
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.avatarLink') }}</span>
        <div class="flex-1">
          <NInput v-model:value="avatar" placeholder="" />
        </div>
      </div>
      <NDivider />
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.defaultChatModel') }}</span>
        <div class="w-[200px]">
          <NSelect
            style="width: 200px"
            :value="userInfo.config.chatModel"
            :options="authStore.session?.chatModels"
            :disabled="!!authStore.session?.auth && !authStore.token"
            @update-value="(val) => updateUserChatModel(val)"
          />
        </div>
      </div>
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.systemRole') }}</span>
        <div class="flex-1">
          <NInput v-model:value="systemRole" type="textarea" placeholder="你是一个大型语言模型。请仔细按照用户的指示进行操作。使用中文并且使用Markdown格式进行回复。" />
        </div>
      </div>
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">temperature</span>
        <div class="flex-1">
          <div>{{ temperature }}</div>
          <NSlider v-model:value="temperature" :step="0.01" :max="1" :min="0.1" style="width: 50%" />
        </div>
      </div>
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">top_p</span>
        <div class="flex-1">
          <div>{{ top_p }}</div>
          <NSlider v-model:value="top_p" :step="0.01" :max="1" :min="0.1" style="width: 50%" />
        </div>
      </div>
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">presence_penalty</span>
        <div class="flex-1">
          <div>{{ presencePenalty }}</div>
          <NSlider v-model:value="presencePenalty" :step="0.1" :max="2" :min="-2" style="width: 50%" />
        </div>
      </div>

      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.saveUserInfo') }}</span>
        <NButton type="primary" @click="updateUserInfo({ avatar, systemRole, temperature, top_p, presencePenalty, name, description })">
          {{ $t('common.save') }}
        </NButton>
      </div>

      <div
        class="flex items-center space-x-4"
        :class="isMobile && 'items-start'"
      >
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.chatHistory') }}</span>

        <div class="flex flex-wrap items-center gap-4">
          <NButton size="small" @click="exportData">
            <template #icon>
              <SvgIcon icon="ri:download-2-fill" />
            </template>
            {{ $t('common.export') }}
          </NButton>

          <input id="fileInput" type="file" style="display:none" @change="importData">
          <NButton size="small" @click="handleImportButtonClick">
            <template #icon>
              <SvgIcon icon="ri:upload-2-fill" />
            </template>
            {{ $t('common.import') }}
          </NButton>
          <NPopconfirm placement="bottom" @positive-click="clearData">
            <template #trigger>
              <NButton size="small">
                <template #icon>
                  <SvgIcon icon="ri:close-circle-line" />
                </template>
                {{ $t('common.clear') }}
              </NButton>
            </template>
            {{ $t('chat.clearHistoryConfirm') }}
          </NPopconfirm>
        </div>
      </div>
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.theme') }}</span>
        <div class="flex flex-wrap items-center gap-4">
          <template v-for="item of themeOptions" :key="item.key">
            <NButton
              size="small"
              :type="item.key === theme ? 'primary' : undefined"
              @click="appStore.setTheme(item.key)"
            >
              <template #icon>
                <SvgIcon :icon="item.icon" />
              </template>
            </NButton>
          </template>
        </div>
      </div>
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.language') }}</span>
        <div class="flex flex-wrap items-center gap-4">
          <NSelect
            style="width: 140px"
            :value="language"
            :options="languageOptions"
            @update-value="value => appStore.setLanguage(value)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
