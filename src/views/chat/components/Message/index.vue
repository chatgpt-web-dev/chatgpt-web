<script setup lang='ts'>
import { computed, ref } from 'vue'
import { NButton, NButtonGroup, NDropdown, NPopover, NSpace, useMessage } from 'naive-ui'
import AvatarComponent from './Avatar.vue'
import TextComponent from './Text.vue'
import { SvgIcon } from '@/components/common'
import { useIconRender } from '@/hooks/useIconRender'
import { t } from '@/locales'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { copyToClip } from '@/utils/copy'
import { useAppStore } from '@/store'

const props = defineProps<Props>()

const emit = defineEmits<Emit>()

const appStore = useAppStore()

interface Props {
  index: number
  currentNavIndex: number
  dateTime?: string
  model?: string
  text?: string
  images?: string[]
  isRecord?: boolean
  inversion?: boolean
  error?: boolean
  loading?: boolean
  responseCount?: number
  usage?: {
    completion_tokens: number
    prompt_tokens: number
    total_tokens: number
    estimated: boolean
  }
}
interface Emit {
  (ev: 'regenerate'): void
  (ev: 'delete', fast: boolean): void
  (ev: 'updateCurrentNavIndex', itemId: number): void
  (ev: 'responseHistory', historyIndex: number): void
}

const { isMobile } = useBasicLayout()

const { iconRender } = useIconRender()

const message = useMessage()

const textRef = ref<HTMLElement>()

const asRawText = ref(props.inversion)

const messageRef = ref<HTMLElement>()

const indexRef = ref<number>(0)
indexRef.value = props.responseCount ?? 0

const url_openai_token = 'https://help.openai.com/en/articles/4936856-what-are-tokens-and-how-to-count-them'

const options = computed(() => {
  const common = [
    {
      label: t('chat.copy'),
      key: 'copyText',
      icon: iconRender({ icon: 'ri:file-copy-2-line' }),
    },
    {
      label: t('common.delete'),
      key: 'delete',
      icon: iconRender({ icon: 'ri:delete-bin-line' }),
    },
  ]

  common.unshift({
      label: asRawText.value ? t('chat.preview') : t('chat.showRawText'),
      key: 'toggleRenderType',
      icon: iconRender({ icon: asRawText.value ? 'ic:outline-code-off' : 'ic:outline-code' }),
	})

  if (props.isRecord) {
    const index = common.findIndex(item => item.key === 'delete')
    common.splice(index, 1)
  }

  return common
})

function handleSelect(key: 'copyText' | 'delete' | 'toggleRenderType') {
  switch (key) {
    case 'copyText':
      handleCopy()
      return
    case 'toggleRenderType':
      asRawText.value = !asRawText.value
      return
    case 'delete':
      emit('delete', false)
  }
}

function handleRegenerate() {
  messageRef.value?.scrollIntoView()
  emit('regenerate')
}

async function handleCopy() {
  try {
    await copyToClip(props.text || '')
    message.success('复制成功')
  }
  catch {
    message.error('复制失败')
  }
}

async function handlePreviousResponse(next: number) {
  if (indexRef.value + next < 1 || indexRef.value + next > props.responseCount!)
    return
  indexRef.value += next
  emit('responseHistory', indexRef.value - 1)
}

function fastDelMsg() {
  emit('updateCurrentNavIndex', -1)
  emit('delete', true)
}

function toggleShowFastDelMsg(event: any, itemId: number) {
  if (window?.getSelection()?.toString())
    return
  if (!isEventTargetValid(event))
    return

  if (props.currentNavIndex === itemId)
    emit('updateCurrentNavIndex', -1)
  else
    emit('updateCurrentNavIndex', itemId)
}

function isEventTargetValid(event: any) {
  let element = event.target
  while (element) {
    if (element.classList && element.classList.contains('excludeFastDel'))
      return false

    element = element.parentElement
  }
  return true
}
</script>

<template>
  <div
    ref="messageRef" class="flex w-full mb-6 overflow-hidden"
    :class="[{ 'flex-row-reverse': inversion }]"
    @click="toggleShowFastDelMsg($event, props.index)"
  >
    <div class="flex flex-col">
      <div
        class="flex items-center justify-center flex-shrink-0 h-8 overflow-hidden rounded-full basis-8"
        :class="[inversion ? 'ml-2' : 'mr-2']"
      >
        <AvatarComponent :image="inversion" :only-default="isRecord" />
      </div>
      <div
        v-show="props.currentNavIndex === props.index && appStore.fastDelMsg"
        class="flex-grow flex items-center justify-center overflow-hidden rounded-full"
        :class="[inversion ? 'ml-2' : 'mr-2']"
      >
        <button class="focus:outline-none" style="opacity: 0.5;" @click="fastDelMsg">
          <SvgIcon class="text-lg" icon="ri:delete-bin-line" />
        </button>
      </div>
    </div>
    <div class="overflow-hidden text-sm " :class="[inversion ? 'items-end' : 'items-start']">
      <p v-if="inversion" class="text-xs text-[#b4bbc4]" :class="[inversion ? 'text-right' : 'text-left']">
        {{ `${model || ''} ${new Date(dateTime as string).toLocaleString()}` }}
      </p>
      <p v-else class="text-xs text-[#b4bbc4]" :class="[inversion ? 'text-right' : 'text-left']">
        <NSpace>
          {{ new Date(dateTime as string).toLocaleString() }}
          <NButtonGroup v-if="!inversion && responseCount && responseCount > 1">
            <NButton
              style="cursor: pointer;"
              size="tiny" quaternary
              :disabled="indexRef === 1"
              @click="handlePreviousResponse(-1)"
            >
              <svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="-3 3 24 24" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><polyline points="15 18 9 12 15 6" /></svg>
            </NButton>
            <span class="text-xs text-[#b4bbc4]"> {{ indexRef }} / {{ responseCount }}</span>
            <NButton
              style="cursor: pointer;"
              size="tiny" quaternary
              :disabled="indexRef === responseCount"
              @click="handlePreviousResponse(1)"
            >
              <svg stroke="currentColor" fill="none" stroke-width="1.5" viewBox="3 3 24 24" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg"><polyline points="9 18 15 12 9 6" /></svg>
            </NButton>
          </NButtonGroup>
          <template v-if="usage">
            <NPopover trigger="hover">
              <template #trigger>
                <span>
                  <span>[</span>
                  <span>{{ usage.estimated ? '~' : '' }}</span>
                  <span>{{ usage.prompt_tokens }}+{{ usage.completion_tokens }}={{ usage.total_tokens }}</span>
                  <span>]</span>
                </span>
              </template>
              <span class="text-xs">
                {{ usage.estimated ? t('chat.usageEstimate') : '' }}
                {{ t('chat.usagePrompt') }} {{ usage.prompt_tokens }}
                + {{ t('chat.usageResponse') }} {{ usage.completion_tokens }}
                = {{ t('chat.usageTotal') }}<a :href="url_openai_token" target="_blank">(?)</a>
                {{ usage.total_tokens }}
              </span>
            </NPopover>
          </template>
        </NSpace>
      </p>
      <div
        class="flex items-end gap-1 mt-2"
        :class="[inversion ? 'flex-row-reverse' : 'flex-row']"
      >
        <TextComponent
          ref="textRef"
          :inversion="inversion"
          :error="error"
          :text="text"
          :images="images"
          :loading="loading"
          :as-raw-text="asRawText"
        />
        <div class="flex flex-col excludeFastDel">
          <button
            v-if="!inversion && !isRecord"
            class="mb-2 transition text-neutral-300 hover:text-neutral-800 dark:hover:text-neutral-300"
            @click="handleRegenerate"
          >
            <SvgIcon icon="ri:restart-line" />
          </button>
          <NDropdown
            :trigger="isMobile ? 'click' : 'hover'"
            :placement="!inversion ? 'right' : 'left'"
            :options="options"
            @select="handleSelect"
          >
            <button class="transition text-neutral-300 hover:text-neutral-800 dark:hover:text-neutral-200">
              <SvgIcon icon="ri:more-2-fill" />
            </button>
          </NDropdown>
        </div>
      </div>
    </div>
  </div>
</template>
