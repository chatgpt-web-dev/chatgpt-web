<script setup lang='ts'>
import type { PopoverPlacement } from 'naive-ui'
import Button from './Button.vue'

interface Props {
  tooltip?: string
  tooltipHelp?: string
  placement?: PopoverPlacement
}

interface Emit {
  (e: 'click'): void
}

const props = withDefaults(defineProps<Props>(), {
  tooltip: '',
  tooltipHelp: '',
  placement: 'bottom',
})

const emit = defineEmits<Emit>()

const showTooltip = computed(() => Boolean(props.tooltip))

function handleClick() {
  emit('click')
}
</script>

<template>
  <div v-if="showTooltip">
    <NTooltip :placement="placement" trigger="hover">
      <template #trigger>
        <Button @click="handleClick">
          <slot />
        </Button>
      </template>
      <span>{{ tooltip }}</span>
      <div v-if="tooltipHelp" class="whitespace-pre-line text-xs">
        <br>
        {{ tooltipHelp }}
      </div>
    </NTooltip>
  </div>
  <div v-else>
    <Button @click="handleClick">
      <slot />
    </Button>
  </div>
</template>
