<script setup lang="ts">
defineProps<Props>()

const { t } = useI18n()

interface Props {
  type: 'built-in' | 'user-defined'
}
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
