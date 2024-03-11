<script setup lang='ts'>
import { onMounted, ref } from 'vue'
import { NButton, NDivider, NInput, NSpin, NStep, NSteps, useMessage } from 'naive-ui'
import QrcodeVue from 'qrcode.vue'
import type { TwoFAConfig } from './model'
import { fetchDisableUser2FA, fetchGetUser2FA, fetchVerifyUser2FA } from '@/api'
import { t } from '@/locales'

const ms = useMessage()

const loading = ref(false)
const saving = ref(false)

const config = ref<TwoFAConfig>()

async function fetchConfig() {
  try {
    loading.value = true
    const { data } = await fetchGetUser2FA<TwoFAConfig>()
    config.value = data
  }
  finally {
    loading.value = false
  }
}

async function update2FAInfo() {
  saving.value = true
  try {
    if (!config.value)
      throw new Error(t('common.invalid'))
    const result = await fetchVerifyUser2FA(config.value.secretKey, config.value.testCode)
    await fetchConfig()
    ms.success(result.message as string)
  }
  catch (error: any) {
    ms.error(error.message)
  }
  saving.value = false
}

async function disable2FA() {
  saving.value = true
  try {
    if (!config.value)
      throw new Error(t('common.invalid'))
    const result = await fetchDisableUser2FA(config.value.testCode)
    await fetchConfig()
    ms.success(result.message as string)
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
          <div class="flex-1">
            {{ $t('setting.info2FA') }}
            <br> {{ $t('setting.status2FA') }} ：
            <span v-if="!config || !config.enaled" style="color: red;">{{ $t('setting.status2FAClosed') }}</span>
            <span v-if="config && config.enaled" style="color: rgb(22, 183, 65);">{{ $t('setting.status2FAOpened') }}</span>
          </div>
        </div>
        <div v-if="config && config.enaled" class="flex items-center space-x-4">
          <div class="w-[200px]">
            <NInput
              :value="config && config.testCode"
              placeholder="6-digit dynamic code"
              @input="(val: string) => { if (config) config.testCode = val }"
            />
          </div>
        </div>
        <div v-if="config && config.enaled" class="flex items-center space-x-4">
          <div class="flex flex-wrap items-center gap-4">
            <NButton
              :loading="saving" type="warning" @click="disable2FA()"
            >
              {{ $t('setting.disable2FA') }}
            </NButton>
          </div>
        </div>
        <NDivider v-if="!config || !config.enaled" />
        <div v-if="!config || !config.enaled" class="flex items-center space-x-4">
          <div class="flex-1">
            <NSteps vertical>
              <NStep
                :title="$t('setting.info2FAStep1')"
                :description="$t('setting.info2FAStep1Desc')"
              />
              <NStep
                :title="$t('setting.info2FAStep2')"
              >
                {{ $t('setting.info2FAStep2Desc') }}
                <br><br>
                <QrcodeVue :value="config?.otpauthUrl" :size="150" level="H" />
                <br>{{ $t('setting.info2FAStep2Tip') }}：<br> {{ $t('setting.info2FAStep2TipAccount') }} ：{{ config?.userName }}<br> {{ $t('setting.info2FAStep2TipSecret') }} ：{{ config?.secretKey }}
              </NStep>
              <NStep
                :title="$t('setting.info2FAStep3')"
              >
                {{ $t('setting.info2FAStep3Desc') }}
                <br>
                <div class="flex items-center space-x-4">
                  <div class="w-[200px]">
                    <NInput
                      :value="config && config.testCode"
                      placeholder=""
                      @input="(val: string) => { if (config) config.testCode = val }"
                    /><br><br>
                    <NButton
                      :loading="saving" type="primary" :disabled="!config || !config.testCode || config.testCode.length !== 6"
                      @click="update2FAInfo()"
                    >
                      {{ $t('setting.enable2FA') }}
                    </NButton>
                  </div>
                </div>
                <br>{{ $t('setting.info2FAStep3Tip1') }}
                <br>{{ $t('setting.info2FAStep3Tip2') }}
                <br>{{ $t('setting.info2FAStep3Tip3') }}
              </NStep>
            </NSteps>
          </div>
        </div>
        <div v-if="!config || !config.enaled" class="flex items-center space-x-4">
          <div class="flex flex-wrap items-center gap-4" />
        </div>
      </div>
    </div>
  </NSpin>
</template>
