<script setup lang='ts'>
import { onMounted, ref } from 'vue'
import { NButton, NInput, NSpin, NSwitch, useMessage } from 'naive-ui'
import { AnnounceConfig, ConfigState } from './model'
import { fetchChatConfig, fetchUpdateAnnounce } from '@/api'
import { t } from '@/locales'

const ms = useMessage()

const loading = ref(false)
const saving = ref(false)

const config = ref<AnnounceConfig>()

async function fetchConfig() {
  try {
    loading.value = true
    const { data } = await fetchChatConfig<ConfigState>()
    config.value = data.announceConfig
  }
  finally {
    loading.value = false
  }
}

async function updateAnnouncement() {
  saving.value = true
  try {
    const { data } = await fetchUpdateAnnounce(config.value as AnnounceConfig)
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
    <div class="space-y-6">
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.announceEnabled') }}</span>
        <div class="flex-1">
          <NSwitch
            :round="false" :value="config && config.enabled"
            @update:value="(val) => { if (config) config.enabled = val }"
          />
        </div>
      </div>
      <div class="flex items-center space-x-4">
        <span class="flex-shrink-0 w-[100px]">{{ $t('setting.announceWords') }}</span>
        <div class="flex-1">
          <NInput
            :value="config && config.announceWords"
            placeholder="输入公告内容 | Set AnnouncementWords"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 10 }"
            @input="(val) => { if (config) config.announceWords = val }"
          />
        </div>
      </div>
      <span class="flex-shrink-0 w-[100px]" />
      <div class="flex flex-wrap items-center gap-4">
        <NButton :loading="saving" type="primary" @click="updateAnnouncement()">
          {{ $t('common.save') }}
        </NButton>
      </div>
    </div>
  </NSpin>
</template>
