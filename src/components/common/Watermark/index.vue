<script setup lang="ts">
import { NWatermark } from 'naive-ui'
import { computed } from 'vue'
import { useUserStore } from '@/store'

const userStore = useUserStore()
const content = computed(() => `${document.title}\n\n\n${userStore.userInfo.name}`)
</script>

<template>
  <NWatermark
    :content="content"
    cross
    fullscreen
    :font-size="16"
    :line-height="16"
    font-family="monospace"
    font-color="rgba(128, 128, 128, .15)"
    :width="384"
    :height="384"
    :x-offset="12"
    :y-offset="65"
    :rotate="-15"
    :z-index="3000"
    text-align="center"
  />
</template>
