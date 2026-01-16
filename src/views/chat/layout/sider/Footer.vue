<script setup lang='ts'>
import { HoverButton, UserAvatar } from '@/components/common'
import { useAuthStore } from '@/store'

const { t } = useI18n()

const Setting = defineAsyncComponent(() => import('@/components/common/Setting/index.vue'))

const authStore = useAuthStore()

const show = ref(false)

async function handleLogout() {
  await authStore.removeToken()
}
</script>

<template>
  <footer class="flex items-center justify-between min-w-0 p-2 pl-4 overflow-hidden border-t dark:border-neutral-800">
    <div class="flex-1 shrink-0 overflow-hidden">
      <UserAvatar />
    </div>
    <HoverButton v-if="!!authStore.token || !!authStore.session?.authProxyEnabled" class="-mr-1" :tooltip="t('common.logOut')" @click="handleLogout">
      <span class="text-lg font-semibold text-[#4f555e] dark:text-white">
        <IconUilExit />
      </span>
    </HoverButton>

    <HoverButton v-if="!!authStore.token || !!authStore.session?.authProxyEnabled" class="ml-0.5" :tooltip="t('setting.setting')" @click="show = true">
      <span class="text-lg font-semibold text-[#4f555e] dark:text-white">
        <IconRiSettings4Line />
      </span>
    </HoverButton>
    <Setting v-if="show" v-model:visible="show" />
  </footer>
</template>
