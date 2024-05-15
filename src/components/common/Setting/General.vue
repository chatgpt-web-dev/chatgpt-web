<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'
import { NButton, NDivider, NInput, NPopconfirm, NSelect, NSwitch, useMessage } from 'naive-ui'
import { UserConfig } from '@/components/common/Setting/model'
import type { Language, Theme } from '@/store/modules/app/helper'
import { SvgIcon } from '@/components/common'
import { useAppStore, useAuthStore, useUserStore } from '@/store'
import type { UserInfo } from '@/store/modules/user/helper'
import { getCurrentDate } from '@/utils/functions'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { decode_redeemcard, fetchClearAllChat, fetchUpdateUserChatModel } from '@/api'

const appStore = useAppStore()
const userStore = useUserStore()
const authStore = useAuthStore()

// 页面加载时读取后端额度（因为扣减计算在后端完成，前端信息滞后）
onMounted(() => {
  userStore.readUserAmt()
})

const { isMobile } = useBasicLayout()

const ms = useMessage()

const theme = computed(() => appStore.theme)

const userInfo = computed(() => userStore.userInfo)

const avatar = ref(userInfo.value.avatar ?? '')

const name = ref(userInfo.value.name ?? '')

const description = ref(userInfo.value.description ?? '')

// 新创建额度和兑换相关响应式变量，为null的话默认送10次
const useAmount = computed(() => userStore.userInfo.useAmount ?? 10)
const redeemCardNo = ref('')

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
  ms.success(`更新个人信息 ${t('common.success')}`)
}
// 更新并兑换，这里图页面设计方便暂时先放一起了，下方页面新增了两个输入框
async function redeemandupdateUserInfo(options: { avatar: string; name: string; description: string; useAmount: number; redeemCardNo: string }) {
  const { avatar, name, description, useAmount, redeemCardNo } = options
  let add_amt = 0
  let message = ''
  try {
    const res = await decode_redeemcard(redeemCardNo)
    add_amt = Number(res.data)
    message = res.message ?? ''
  }
  catch (error: any) {
    add_amt = 0
    message = error.message ?? ''
  }
  const new_useAmount = useAmount + add_amt
  const new_options = { avatar, name, description, useAmount: new_useAmount }

  await updateUserInfo(new_options)
  userStore.readUserAmt()
  ms.success(`兑换码：${message},本次充值${add_amt.toString()}次，总计${new_useAmount.toString()}次`)
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
      <div v-if="authStore.session?.usageCountLimit && userStore.userInfo.limit" class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.useAmount') }}</span>
        <div class="flex-1">
          <div v-text="useAmount" />
        </div>
      </div>
      <div v-if="authStore.session?.usageCountLimit && userStore.userInfo.limit" class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.redeemCardNo') }}</span>
        <div class="flex-1">
          <NInput v-model:value="redeemCardNo" placeholder="" />
        </div>
      </div>
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.avatarLink') }}</span>
        <div class="flex-1">
          <NInput v-model:value="avatar" placeholder="" />
        </div>
      </div>
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.saveUserInfo') }}</span>
        <NButton type="primary" @click="redeemandupdateUserInfo({ avatar, name, description, useAmount, redeemCardNo })">
          {{ $t('common.save') }}
        </NButton>
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
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.fastDelMsg') }}</span>
        <div class="flex-1">
          <NSwitch
            :round="false"
            :value="appStore.fastDelMsg"
            @update-value="value => appStore.setFastDelMsg(value)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
