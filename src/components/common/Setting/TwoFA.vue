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
            两步验证是一个额外的验证步骤，可让您的登录体验更加安全。开启两步验证后，每次您要登录到您的帐户时，系统均提示您输入动态验证码。
            <br> 当前状态 ：
            <span v-if="!config || !config.enaled" style="color: red;">关闭</span>
            <span v-if="config && config.enaled" style="color: rgb(22, 183, 65);">已开启</span>
          </div>
        </div>
        <div v-if="config && config.enaled" class="flex items-center space-x-4">
          <div class="w-[200px]">
            <NInput
              :value="config && config.testCode"
              placeholder="6-digit dynamic code"
              @input="(val) => { if (config) config.testCode = val }"
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
                title="安装身份验证器App"
                description="安装身份验证器App，例如Google Authenticator、Microsoft Authenticator、Authy等"
              />
              <NStep
                title="配置生成验证码"
              >
                打开身份验证器 App，点击「扫描二维码」扫描二维码。
                <br><br>
                <QrcodeVue :value="config?.otpauthUrl" :size="150" level="H" />
                <br>注意： 身份验证器不能扫描验证码？ 手动添加以下账户：<br> 账户 ：{{ config?.userName }}<br> 密钥 ：{{ config?.secretKey }}
              </NStep>
              <NStep
                title="验证并开启"
              >
                请输入身份验证器 App 生成的 6 位动态验证码，开启两步验证。
                <br>
                <div class="flex items-center space-x-4">
                  <div class="w-[200px]">
                    <NInput
                      :value="config && config.testCode"
                      placeholder=""
                      @input="(val) => { if (config) config.testCode = val }"
                    /><br><br>
                    <NButton
                      :loading="saving" type="primary" :disabled="!config || !config.testCode || config.testCode.length !== 6"
                      @click="update2FAInfo()"
                    >
                      {{ $t('setting.enable2FA') }}
                    </NButton>
                  </div>
                </div>
                <br>注意：如何关闭两步验证？<br>1. 登录后，在 两步验证 页面使用两步验证码关闭。<br>2. 联系管理员重置密码来关闭两步验证。
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
