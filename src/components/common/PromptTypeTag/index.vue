<script setup lang="ts">
import { t } from '@/locales'

interface Props {
  type: 'built-in' | 'user-defined'
}

defineProps<Props>()
</script>

<template>
  <NTag
    size="small"
    :type="type === 'built-in' ? 'success' : 'info'"
    round
    style="
      width: 85px;
      display: inline-flex;
      justify-content: center;
      align-items: center;
    "
  >
    {{ type === 'built-in' ? t('store.builtIn') : t('store.userDefined') }}
  </NTag>
</template>
