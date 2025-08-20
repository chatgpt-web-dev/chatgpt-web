<script lang="ts" setup>
import defaultAvatar from '@/assets/avatar.jpg'
import { useUserStore } from '@/store'
import { isString } from '@/utils/is'

interface Props {
  image?: boolean
  onlyDefault?: boolean
}
defineProps<Props>()

const userStore = useUserStore()

const avatar = computed(() => userStore.userInfo.avatar)
</script>

<template>
  <template v-if="image">
    <NAvatar v-if="isString(avatar) && avatar.length > 0 && !onlyDefault" :src="avatar" :fallback-src="defaultAvatar" />
    <NAvatar v-else round :src="defaultAvatar" />
  </template>
  <span v-else class="text-[28px] dark:text-white">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true" width="1em" height="1em">
        <image x="0" y="0" width="32" height="32" xlink:href="https://www.zje.cc/wp-content/uploads/2024/05/favicon.svg" />
    </svg>
  </span>
</template>
