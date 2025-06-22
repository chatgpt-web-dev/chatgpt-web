<script setup lang='ts'>
import type { ConfigState } from './model'
import { fetchChatConfig, fetchUpdateSite } from '@/api'
import { SiteConfig } from './model'

const { t } = useI18n()

const ms = useMessage()

const loading = ref(false)
const saving = ref(false)

const config = ref(new SiteConfig())

async function fetchConfig() {
  try {
    loading.value = true
    const { data } = await fetchChatConfig<ConfigState>()
    config.value = data.siteConfig ? data.siteConfig : new SiteConfig()
  }
  finally {
    loading.value = false
  }
}

async function updateSiteInfo(site?: SiteConfig) {
  if (!site)
    return

  saving.value = true
  try {
    const { data } = await fetchUpdateSite(site)
    config.value = data
    ms.success(t('common.success'))
  }
  catch (error: any) {
    ms.error(error.message)
  }
  saving.value = false
}

onMounted(() => {
  fetchConfig()
})
</script>

<template>
  <NSpin :show="loading">
    <div class="p-4 space-y-5 min-h-[200px]">
      <div class="space-y-6">
        <div class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]">{{ t('setting.siteTitle') }}</span>
          <div class="flex-1">
            <NInput
              :value="config && config.siteTitle" placeholder=""
              @input="(val) => { if (config) config.siteTitle = val }"
            />
          </div>
        </div>
        <div class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]">{{ t('setting.siteDomain') }}</span>
          <div class="flex-1">
            <NInput
              :value="config && config.siteDomain" placeholder=""
              @input="(val) => { if (config) config.siteDomain = val }"
            />
          </div>
        </div>
        <div class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]">{{ t('setting.loginEnabled') }}</span>
          <div class="flex-1">
            <NSwitch
              :round="false"
              :disabled="config && config.loginEnabled"
              :value="config && config.loginEnabled"
              @update:value="(val) => { if (config) config.loginEnabled = val }"
            />
          </div>
        </div>
        <div class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]">{{ t('setting.loginSalt') }}</span>
          <div class="flex-1">
            <NInput
              :value="config && config.loginSalt" :placeholder="t('setting.loginSaltTip')"
              @input="(val) => { if (config) config.loginSalt = val }"
            />
          </div>
        </div>
        <div class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]">{{ t('setting.registerEnabled') }}</span>
          <div class="flex-1">
            <NSwitch
              :round="false"
              :value="config && config.registerEnabled"
              @update:value="(val) => { if (config) config.registerEnabled = val }"
            />
          </div>
        </div>
        <div v-show="config && config.registerEnabled" class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]">{{ t('setting.registerReview') }}</span>
          <div class="flex-1">
            <NSwitch
              :round="false"
              :value="config && config.registerReview"
              @update:value="(val) => { if (config) config.registerReview = val }"
            />
          </div>
        </div>
        <div class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]">{{ t('setting.registerMails') }}</span>
          <div class="flex-1">
            <NInput
              :value="config && config.registerMails" :placeholder="t('setting.registerReviewTip')"
              @input="(val) => { if (config) config.registerMails = val }"
            />
          </div>
        </div>
        <div class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]">{{ t('setting.chatModels') }}</span>
          <div class="flex-1">
            <NInput
              :value="config && config.chatModels"
              placeholder="英文逗号分割 | English comma separated"
              type="textarea"
              :autosize="{ minRows: 1, maxRows: 4 }"
              @input="(val) => { if (config) config.chatModels = val }"
            />
          </div>
        </div>
        <!-- 增加新注册用户的全局数量设置 -->
        <div class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]">{{ t('setting.globalAmount') }}</span>
          <div class="flex-1">
            <NInputNumber
              v-model:value="config.globalAmount" placeholder=""
            />
          </div>
        </div>
        <div class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]">{{ t('setting.usageCountLimit') }}</span>
          <div class="flex-1">
            <NSwitch
              :round="false"
              :value="config && config.usageCountLimit"
              @update:value="(val) => { if (config) config.usageCountLimit = val }"
            />
          </div>
        </div>
        <div class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]">{{ t('setting.showWatermark') }}</span>
          <div class="flex-1">
            <NSwitch
              :round="false"
              :value="config && config.showWatermark"
              @update:value="(val) => { if (config) config.showWatermark = val }"
            />
          </div>
        </div>
        <div class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]" />
          <NButton :loading="saving" type="primary" @click="updateSiteInfo(config)">
            {{ t('common.save') }}
          </NButton>
        </div>
      </div>
    </div>
  </NSpin>
</template>
