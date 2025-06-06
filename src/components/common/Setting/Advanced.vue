<script lang="ts" setup>
import { t } from '@/locales'
import { useUserStore } from '@/store'

const userStore = useUserStore()

const ms = useMessage()

function updateSettings(sync: boolean) {
  userStore.updateSetting(sync)
  ms.success(t('common.success'))
}

function handleReset() {
  userStore.resetSetting()
  ms.success(t('common.success'))
  // window.location.reload()
}
</script>

<template>
  <div class="p-4 space-y-5 min-h-[200px]">
    <div class="space-y-6">
      <div class="flex items-center space-x-4">
        <span class="shrink-0 w-[120px]">{{ $t('setting.role') }}</span>
        <div class="flex-1">
          <NInput v-model:value="userStore.userInfo.advanced.systemMessage" type="textarea" :autosize="{ minRows: 1, maxRows: 4 }" />
        </div>
      </div>
      <div class="flex items-center space-x-4">
        <span class="shrink-0 w-[120px]">{{ $t('setting.temperature') }} </span>
        <div class="flex-1">
          <NSlider v-model:value="userStore.userInfo.advanced.temperature" :max="1" :min="0" :step="0.1" />
        </div>
        <span>{{ userStore.userInfo.advanced.temperature }}</span>
      </div>
      <div class="flex items-center space-x-4">
        <span class="shrink-0 w-[120px]">{{ $t('setting.top_p') }} </span>
        <div class="flex-1">
          <NSlider v-model:value="userStore.userInfo.advanced.top_p" :max="1" :min="0" :step="0.1" />
        </div>
        <span>{{ userStore.userInfo.advanced.top_p }}</span>
      </div>
      <div class="flex items-center space-x-4">
        <span class="shrink-0 w-[120px]">&nbsp;</span>
        <NButton type="primary" @click="updateSettings(false)">
          {{ $t('common.save') }}
        </NButton>
        <NButton v-if="userStore.userInfo.root" type="info" @click="updateSettings(true)">
          {{ $t('common.sync') }}
        </NButton>
        <NButton type="warning" @click="handleReset">
          {{ $t('common.reset') }}
        </NButton>
      </div>
    </div>
  </div>
</template>
