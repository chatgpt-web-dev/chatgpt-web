<script setup lang='ts'>
import type { MessageReactive, UploadFileInfo } from 'naive-ui'
import html2canvas from 'html2canvas'
import {
  fetchChatAPIProcess,
  fetchChatResponseoHistory,
  fetchChatStopResponding,
  fetchUpdateChatRoomMaxContextCount,
  fetchUpdateUserMaxContextCount,
} from '@/api'
import { HoverButton, SvgIcon } from '@/components/common'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import IconPrompt from '@/icons/Prompt.vue'
import { t } from '@/locales'
import { useAuthStore, useChatStore, usePromptStore, useUserStore } from '@/store'
import { debounce } from '@/utils/functions/debounce'
import { Message } from './components'
import HeaderComponent from './components/Header/index.vue'
import { useChat } from './hooks/useChat'
import { useScroll } from './hooks/useScroll'

const Prompt = defineAsyncComponent(() => import('@/components/common/Setting/Prompt.vue'))

let controller = new AbortController()
let lastChatInfo: any = {}

const openLongReply = import.meta.env.VITE_GLOB_OPEN_LONG_REPLY === 'true'

const route = useRoute()
const dialog = useDialog()
const ms = useMessage()
const authStore = useAuthStore()
const userStore = useUserStore()
const chatStore = useChatStore()

const { isMobile } = useBasicLayout()
const { addChat, updateChat, updateChatSome, getChatByUuidAndIndex } = useChat()
const { scrollRef, scrollToBottom, scrollToBottomIfAtBottom, scrollTo } = useScroll()

const { uuid } = route.params as { uuid: string }

const currentChatHistory = computed(() => chatStore.getChatRoomByCurrentActive)
const usingContext = computed(() => currentChatHistory?.value?.usingContext ?? true)
const dataSources = computed(() => chatStore.getChatByUuid(+uuid))
const conversationList = computed(() => dataSources.value.filter(item => (!item.inversion && !!item.conversationOptions)))

const prompt = ref<string>('')
const firstLoading = ref<boolean>(false)
const loading = ref<boolean>(false)
const inputRef = ref<Ref | null>(null)
const showPrompt = ref(false)
const nowSelectChatModel = ref<string | null>(null)
const currentChatModel = computed(() => nowSelectChatModel.value ?? currentChatHistory.value?.chatModel ?? userStore.userInfo.config.chatModel)

const currentNavIndexRef = ref<number>(-1)

let loadingms: MessageReactive
let allmsg: MessageReactive
let prevScrollTop: number

// 添加PromptStore
const promptStore = usePromptStore()

// 使用storeToRefs，保证store修改后，联想部分能够重新渲染
// @ts-expect-error TS2339: Property 'promptList' does not exist on type 'StoreToRefs<any>'.
const { promptList: promptTemplate } = storeToRefs<any>(promptStore)

// 未知原因刷新页面，loading 状态不会重置，手动重置
dataSources.value.forEach((item, index) => {
  if (item.loading)
    updateChatSome(+uuid, index, { loading: false })
})

function handleSubmit() {
  onConversation()
}

const uploadFileKeysRef = ref<string[]>([])

async function onConversation() {
  let message = prompt.value

  if (loading.value)
    return

  if (!message || message.trim() === '')
    return

  if (nowSelectChatModel.value && currentChatHistory.value)
    currentChatHistory.value.chatModel = nowSelectChatModel.value

  const uploadFileKeys = uploadFileKeysRef.value
  uploadFileKeysRef.value = []

  controller = new AbortController()

  const chatUuid = Date.now()
  addChat(
    +uuid,
    {
      uuid: chatUuid,
      dateTime: new Date().toLocaleString(),
      text: message,
      images: uploadFileKeys,
      inversion: true,
      error: false,
      conversationOptions: null,
      requestOptions: { prompt: message, options: null },
    },
  )
  scrollToBottom()

  loading.value = true
  prompt.value = ''

  let options: Chat.ConversationRequest = {}
  const lastContext = conversationList.value[conversationList.value.length - 1]?.conversationOptions

  if (lastContext && usingContext.value)
    options = { ...lastContext }

  addChat(
    +uuid,
    {
      uuid: chatUuid,
      dateTime: new Date().toLocaleString(),
      text: '',
      loading: true,
      inversion: false,
      error: false,
      conversationOptions: null,
      requestOptions: { prompt: message, options: { ...options } },
    },
  )
  scrollToBottom()

  try {
    let lastText = ''
    const fetchChatAPIOnce = async () => {
      let searchQuery: string
      let searchResults: Chat.SearchResult[]
      let searchUsageTime: number

      await fetchChatAPIProcess<Chat.ConversationResponse>({
        roomId: +uuid,
        uuid: chatUuid,
        prompt: message,
        uploadFileKeys,
        options,
        signal: controller.signal,
        onDownloadProgress: ({ event }) => {
          const xhr = event.target
          const { responseText } = xhr
          // Always process the final line
          const lastIndex = responseText.lastIndexOf('\n', responseText.length - 2)
          let chunk = responseText
          if (lastIndex !== -1)
            chunk = responseText.substring(lastIndex)
          try {
            const data = JSON.parse(chunk)
            if (data.searchQuery)
              searchQuery = data.searchQuery
            if (data.searchResults)
              searchResults = data.searchResults
            if (data.searchUsageTime)
              searchUsageTime = data.searchUsageTime

            lastChatInfo = data
            const usage = (data.detail && data.detail.usage)
              ? {
                  completion_tokens: data.detail.usage.completion_tokens || null,
                  prompt_tokens: data.detail.usage.prompt_tokens || null,
                  total_tokens: data.detail.usage.total_tokens || null,
                  estimated: data.detail.usage.estimated || null,
                }
              : undefined
            updateChat(
              +uuid,
              dataSources.value.length - 1,
              {
                dateTime: new Date().toLocaleString(),
                searchQuery,
                searchResults,
                searchUsageTime,
                reasoning: data?.reasoning,
                text: lastText + (data.text ?? ''),
                inversion: false,
                error: false,
                loading: true,
                conversationOptions: { conversationId: data.conversationId, parentMessageId: data.id },
                requestOptions: { prompt: message, options: { ...options } },
                usage,
              },
            )

            if (openLongReply && data.detail && data.detail.choices.length > 0 && data.detail.choices[0].finish_reason === 'length') {
              options.parentMessageId = data.id
              lastText = data.text
              message = ''
              return fetchChatAPIOnce()
            }

            scrollToBottomIfAtBottom()
          }
          catch {
            //
          }
        },
      })
      updateChatSome(+uuid, dataSources.value.length - 1, { loading: false })
    }

    await fetchChatAPIOnce()
  }
  catch (error: any) {
    const errorMessage = error?.message ?? t('common.wrong')

    if (error.message === 'canceled') {
      updateChatSome(
        +uuid,
        dataSources.value.length - 1,
        {
          loading: false,
        },
      )
      scrollToBottomIfAtBottom()
      return
    }

    const currentChat = getChatByUuidAndIndex(+uuid, dataSources.value.length - 1)

    if (currentChat?.text && currentChat.text !== '') {
      updateChatSome(
        +uuid,
        dataSources.value.length - 1,
        {
          text: `${currentChat.text}\n[${errorMessage}]`,
          error: false,
          loading: false,
        },
      )
      return
    }

    updateChat(
      +uuid,
      dataSources.value.length - 1,
      {
        dateTime: new Date().toLocaleString(),
        text: errorMessage,
        inversion: false,
        error: true,
        loading: false,
        conversationOptions: null,
        requestOptions: { prompt: message, options: { ...options } },
      },
    )
    scrollToBottomIfAtBottom()
  }
  finally {
    loading.value = false
  }
}

async function onRegenerate(index: number) {
  if (loading.value)
    return

  controller = new AbortController()

  const { requestOptions } = dataSources.value[index]
  let responseCount = dataSources.value[index].responseCount || 1
  responseCount++

  let message = requestOptions?.prompt ?? ''

  let options: Chat.ConversationRequest = {}

  if (requestOptions.options)
    options = { ...requestOptions.options }

  loading.value = true
  const chatUuid = dataSources.value[index].uuid
  updateChat(
    +uuid,
    index,
    {
      dateTime: new Date().toLocaleString(),
      text: '',
      inversion: false,
      responseCount,
      error: false,
      loading: true,
      conversationOptions: null,
      requestOptions: { prompt: message, options: { ...options } },
    },
  )

  try {
    let lastText = ''
    const fetchChatAPIOnce = async () => {
      await fetchChatAPIProcess<Chat.ConversationResponse>({
        roomId: +uuid,
        uuid: chatUuid || Date.now(),
        regenerate: true,
        prompt: message,
        options,
        signal: controller.signal,
        onDownloadProgress: ({ event }) => {
          const xhr = event.target
          const { responseText } = xhr
          // Always process the final line
          const lastIndex = responseText.lastIndexOf('\n', responseText.length - 2)
          let chunk = responseText
          if (lastIndex !== -1)
            chunk = responseText.substring(lastIndex)
          try {
            const data = JSON.parse(chunk)
            lastChatInfo = data
            const usage = (data.detail && data.detail.usage)
              ? {
                  completion_tokens: data.detail.usage.completion_tokens || null,
                  prompt_tokens: data.detail.usage.prompt_tokens || null,
                  total_tokens: data.detail.usage.total_tokens || null,
                  estimated: data.detail.usage.estimated || null,
                }
              : undefined
            updateChat(
              +uuid,
              index,
              {
                dateTime: new Date().toLocaleString(),
                reasoning: data?.reasoning,
                finish_reason: data?.finish_reason,
                text: lastText + (data.text ?? ''),
                inversion: false,
                responseCount,
                error: false,
                loading: true,
                conversationOptions: { conversationId: data.conversationId, parentMessageId: data.id },
                requestOptions: { prompt: message, options: { ...options } },
                usage,
              },
            )

            if (openLongReply && data.detail && data.detail.choices.length > 0 && data.detail.choices[0].finish_reason === 'length') {
              options.parentMessageId = data.id
              lastText = data.text
              message = ''
              return fetchChatAPIOnce()
            }
          }
          catch {
            //
          }
        },
      })
      updateChatSome(+uuid, index, { loading: false })
    }
    await fetchChatAPIOnce()
  }
  catch (error: any) {
    if (error.message === 'canceled') {
      updateChatSome(
        +uuid,
        index,
        {
          loading: false,
        },
      )
      return
    }

    const errorMessage = error?.message ?? t('common.wrong')

    updateChat(
      +uuid,
      index,
      {
        dateTime: new Date().toLocaleString(),
        text: errorMessage,
        inversion: false,
        responseCount,
        error: true,
        loading: false,
        conversationOptions: null,
        requestOptions: { prompt: message, options: { ...options } },
      },
    )
  }
  finally {
    loading.value = false
  }
}

async function onResponseHistory(index: number, historyIndex: number) {
  const chat = (await fetchChatResponseoHistory(+uuid, dataSources.value[index].uuid || Date.now(), historyIndex)).data
  updateChat(
    +uuid,
    index,
    {
      dateTime: chat.dateTime,
      reasoning: chat?.reasoning,
      text: chat.text,
      inversion: false,
      responseCount: chat.responseCount,
      error: true,
      loading: false,
      conversationOptions: chat.conversationOptions,
      requestOptions: { prompt: chat.requestOptions.prompt, options: { ...chat.requestOptions.options } },
      usage: chat.usage,
    },
  )
}

function handleExport() {
  if (loading.value)
    return

  const d = dialog.warning({
    title: t('chat.exportImage'),
    content: t('chat.exportImageConfirm'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: async () => {
      try {
        d.loading = true
        const ele = document.getElementById('image-wrapper')
        const canvas = await html2canvas(ele as HTMLDivElement, {
          useCORS: true,
        })
        const imgUrl = canvas.toDataURL('image/png')
        const tempLink = document.createElement('a')
        tempLink.style.display = 'none'
        tempLink.href = imgUrl
        tempLink.setAttribute('download', 'chat-shot.png')
        if (typeof tempLink.download === 'undefined')
          tempLink.setAttribute('target', '_blank')

        document.body.appendChild(tempLink)
        tempLink.click()
        document.body.removeChild(tempLink)
        window.URL.revokeObjectURL(imgUrl)
        d.loading = false
        ms.success(t('chat.exportSuccess'))
        Promise.resolve()
      }
      catch {
        ms.error(t('chat.exportFailed'))
      }
      finally {
        d.loading = false
      }
    },
  })
}

function handleDelete(index: number, fast: boolean) {
  if (loading.value)
    return

  if (fast === true) {
    chatStore.deleteChatByUuid(+uuid, index)
  }
  else {
    dialog.warning({
      title: t('chat.deleteMessage'),
      content: t('chat.deleteMessageConfirm'),
      positiveText: t('common.yes'),
      negativeText: t('common.no'),
      onPositiveClick: () => {
        chatStore.deleteChatByUuid(+uuid, index)
      },
    })
  }
}

function updateCurrentNavIndex(index: number, newIndex: number) {
  currentNavIndexRef.value = newIndex
}

function handleClear() {
  if (loading.value)
    return

  dialog.warning({
    title: t('chat.clearChat'),
    content: t('chat.clearChatConfirm'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: () => {
      chatStore.clearChatByUuid(+uuid)
    },
  })
}

function handleEnter(event: KeyboardEvent) {
  if (!isMobile.value) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  }
  else {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault()
      handleSubmit()
    }
  }
}

async function handleStop() {
  if (loading.value) {
    controller.abort()
    loading.value = false
    await fetchChatStopResponding(lastChatInfo.text, lastChatInfo.id, lastChatInfo.conversationId)
  }
}

async function loadMoreMessage(event: any) {
  const chatIndex = chatStore.chat.findIndex(d => d.roomId === +uuid)
  if (chatIndex <= -1 || chatStore.chat[chatIndex].data.length <= 0)
    return

  const scrollPosition = event.target.scrollHeight - event.target.scrollTop

  const lastId = chatStore.chat[chatIndex].data[0].uuid
  await chatStore.syncChat({ roomId: +uuid } as Chat.ChatRoom, lastId, () => {
    loadingms && loadingms.destroy()
    nextTick(() => scrollTo(event.target.scrollHeight - scrollPosition))
  }, () => {
    loadingms = ms.loading(
      '加载中...',
      {
        duration: 0,
      },
    )
  }, () => {
    allmsg && allmsg.destroy()
    allmsg = ms.warning('没有更多了', {
      duration: 1000,
    })
  })
}

const handleLoadMoreMessage = debounce(loadMoreMessage, 300)
const handleSyncChat
  = debounce(() => {
    // 直接刷 极小概率不请求
    chatStore.syncChat({ roomId: Number(uuid) } as Chat.ChatRoom, undefined, () => {
      firstLoading.value = false
      const scrollRef = document.querySelector('#scrollRef')
      if (scrollRef)
        nextTick(() => scrollRef.scrollTop = scrollRef.scrollHeight)
      if (inputRef.value && !isMobile.value)
        inputRef.value?.focus()
    })
  }, 200)

async function handleScroll(event: any) {
  const scrollTop = event.target.scrollTop
  if (scrollTop < 50 && (scrollTop < prevScrollTop || prevScrollTop === undefined))
    handleLoadMoreMessage(event)
  prevScrollTop = scrollTop
}

async function handleToggleSearchEnabled() {
  if (!currentChatHistory.value)
    return

  const searchEnabled = currentChatHistory.value.searchEnabled ?? false
  currentChatHistory.value.searchEnabled = !searchEnabled
  await chatStore.setChatSearchEnabled(!searchEnabled, +uuid)
  if (currentChatHistory.value.searchEnabled)
    ms.success(t('chat.turnOnSearch'))
  else
    ms.warning(t('chat.turnOffSearch'))
}

async function handleToggleThinkEnabled() {
  if (!currentChatHistory.value)
    return

  const thinkEnabled = currentChatHistory.value.thinkEnabled ?? false
  currentChatHistory.value.thinkEnabled = !thinkEnabled
  await chatStore.setChatThinkEnabled(!thinkEnabled, +uuid)
  if (currentChatHistory.value.thinkEnabled)
    ms.success(t('chat.turnOnThink'))
  else
    ms.warning(t('chat.turnOffThink'))
}

async function handleToggleUsingContext() {
  if (!currentChatHistory.value)
    return

  currentChatHistory.value.usingContext = !currentChatHistory.value.usingContext
  chatStore.setUsingContext(currentChatHistory.value.usingContext, +uuid)
  if (currentChatHistory.value.usingContext)
    ms.success(t('chat.turnOnContext'))
  else
    ms.warning(t('chat.turnOffContext'))
}

// 可优化部分
// 搜索选项计算，这里使用value作为索引项，所以当出现重复value时渲染异常(多项同时出现选中效果)
// 理想状态下其实应该是key作为索引项,但官方的renderOption会出现问题，所以就需要value反renderLabel实现
const searchOptions = computed(() => {
  if (prompt.value.startsWith('/')) {
    return promptTemplate.value.filter((item: { title: string }) => item.title.toLowerCase().includes(prompt.value.substring(1).toLowerCase())).map((obj: { value: any }) => {
      return {
        label: obj.value,
        value: obj.value,
      }
    })
  }
  else {
    return []
  }
})

// value反渲染key
function renderOption(option: { label: string }) {
  for (const i of promptTemplate.value) {
    if (i.value === option.label)
      return [i.title]
  }
  return []
}

const placeholder = computed(() => {
  if (isMobile.value)
    return t('chat.placeholderMobile')
  return t('chat.placeholder')
})

const buttonDisabled = computed(() => {
  return loading.value || !prompt.value || prompt.value.trim() === ''
})

const footerClass = computed(() => {
  let classes = ['p-4']
  if (isMobile.value)
    classes = ['sticky', 'left-0', 'bottom-0', 'right-0', 'p-2', 'pr-3', 'overflow-hidden']
  return classes
})

async function handleSyncChatModel(chatModel: string) {
  nowSelectChatModel.value = chatModel
  await chatStore.setChatModel(chatModel, +uuid)
}

function handleUpdateMaxContextCount(maxContextCount: number) {
  if (currentChatHistory.value) {
    currentChatHistory.value.maxContextCount = maxContextCount
  }
}

async function handleSyncMaxContextCount() {
  try {
    if (currentChatHistory?.value) {
      // Sync to both user and room
      await Promise.all([
        fetchUpdateUserMaxContextCount(currentChatHistory?.value.maxContextCount),
        fetchUpdateChatRoomMaxContextCount(currentChatHistory?.value.maxContextCount, +uuid),
      ])
      userStore.userInfo.config.maxContextCount = currentChatHistory?.value.maxContextCount
    }
  }
  catch (error) {
    console.error('Failed to sync max context count:', error)
  }
}

// https://github.com/tusen-ai/naive-ui/issues/4887
function handleFinish(options: { file: UploadFileInfo, event?: ProgressEvent }) {
  if (options.file.status === 'finished') {
    const response = (options.event?.target as XMLHttpRequest).response
    uploadFileKeysRef.value.push(`${response.data.fileKey}`)
  }
}

function handleDeleteUploadFile() {
  uploadFileKeysRef.value.pop()
}

const uploadHeaders = computed(() => {
  const token = useAuthStore().token
  return {
    Authorization: `Bearer ${token}`,
  }
})

onMounted(() => {
  firstLoading.value = true
  handleSyncChat()

  if (authStore.token) {
    const chatModels = authStore.session?.chatModels
    if (chatModels != null && chatModels.filter(d => d.value === userStore.userInfo.config.chatModel).length <= 0)
      ms.error('你选择的模型已不存在，请重新选择 | The selected model not exists, please choose again.', { duration: 7000 })
  }
})

watch(() => chatStore.active, () => {
  handleSyncChat()
})

onUnmounted(() => {
  if (loading.value)
    controller.abort()
})
</script>

<template>
  <div class="flex flex-col w-full h-full">
    <HeaderComponent
      v-if="isMobile"
      :using-context="usingContext"
      :show-prompt="showPrompt"
      :search-enabled="currentChatHistory?.searchEnabled"
      :think-enabled="currentChatHistory?.thinkEnabled"
      @export="handleExport"
      @toggle-using-context="handleToggleUsingContext"
      @toggle-search-enabled="handleToggleSearchEnabled"
      @toggle-think-enabled="handleToggleThinkEnabled"
      @toggle-show-prompt="showPrompt = true"
    />
    <main class="flex-1 overflow-hidden">
      <div id="scrollRef" ref="scrollRef" class="h-full overflow-hidden overflow-y-auto" @scroll="handleScroll">
        <div
          id="image-wrapper"
          class="w-full max-w-(--breakpoint-xl) m-auto dark:bg-[#101014]"
          :class="[isMobile ? 'p-2' : 'p-4']"
        >
          <NSpin :show="firstLoading">
            <template v-if="!dataSources.length">
              <div class="flex items-center justify-center mt-4 text-center text-neutral-300">
                <SvgIcon icon="ri:bubble-chart-fill" class="mr-2 text-3xl" />
                <span>Aha~</span>
              </div>
            </template>
            <template v-else>
              <div>
                <Message
                  v-for="(item, index) of dataSources"
                  :key="String(item.uuid) + String(item.inversion)"
                  :index="index"
                  :current-nav-index="currentNavIndexRef"
                  :date-time="item.dateTime"
                  :search-query="item?.searchQuery"
                  :search-results="item?.searchResults"
                  :search-usage-time="item?.searchUsageTime"
                  :reasoning="item?.reasoning"
                  :finish-reason="item?.finish_reason"
                  :text="item.text"
                  :images="item.images"
                  :inversion="item.inversion"
                  :response-count="item.responseCount"
                  :usage="item && item.usage || undefined"
                  :error="item.error"
                  :loading="item.loading"
                  @regenerate="onRegenerate(index)"
                  @update-current-nav-index="(itemId: number) => updateCurrentNavIndex(index, itemId)"
                  @delete="(fast) => handleDelete(index, fast)"
                  @response-history="(ev) => onResponseHistory(index, ev)"
                />
                <div class="sticky bottom-0 left-0 flex justify-center">
                  <NButton v-if="loading" type="warning" @click="handleStop">
                    <template #icon>
                      <SvgIcon icon="ri:stop-circle-line" />
                    </template>
                    Stop Responding
                  </NButton>
                </div>
              </div>
            </template>
          </NSpin>
        </div>
      </div>
    </main>
    <footer :class="footerClass">
      <div class="w-full max-w-(--breakpoint-xl) m-auto">
        <NSpace vertical>
          <div v-if="uploadFileKeysRef.length > 0" class="flex items-center space-x-2 h-10">
            <NSpace>
              <img v-for="(v, i) of uploadFileKeysRef" :key="i" :src="`/uploads/${v}`" class="max-h-10">
              <HoverButton @click="handleDeleteUploadFile">
                <span class="text-xl text-[#4f555e] dark:text-white">
                  <SvgIcon icon="ri:delete-back-2-fill" />
                </span>
              </HoverButton>
            </NSpace>
          </div>

          <div class="flex items-center space-x-2">
            <div>
              <NUpload
                action="/api/upload-image"
                list-type="image"
                class="flex items-center justify-center h-10 transition hover:bg-neutral-100 dark:hover:bg-[#414755]"
                style="flex-flow:row nowrap;min-width:2.5em;padding:.5em;border-radius:.5em;"
                :headers="uploadHeaders"
                :show-file-list="false"
                :multiple="true"
                response-type="json"
                accept="image/png, image/jpeg, image/webp, image/gif"
                @finish="handleFinish"
              >
                <span class="text-xl text-[#4f555e] dark:text-white">
                  <SvgIcon icon="ri:image-edit-line" />
                </span>
              </NUpload>
            </div>
            <HoverButton @click="handleClear">
              <span class="text-xl text-[#4f555e] dark:text-white">
                <SvgIcon icon="ri:delete-bin-line" />
              </span>
            </HoverButton>
            <HoverButton v-if="!isMobile" @click="handleExport">
              <span class="text-xl text-[#4f555e] dark:text-white">
                <SvgIcon icon="ri:download-2-line" />
              </span>
            </HoverButton>
            <HoverButton v-if="!isMobile" @click="showPrompt = true">
              <span class="text-xl text-[#4f555e] dark:text-white">
                <IconPrompt class="w-[20px] m-auto" />
              </span>
            </HoverButton>
            <NSelect
              style="width: 250px"
              :value="currentChatModel"
              :options="authStore.session?.chatModels"
              :disabled="!!authStore.session?.auth && !authStore.token && !authStore.session?.authProxyEnabled"
              @update-value="(val) => handleSyncChatModel(val)"
            />
            <HoverButton
              v-if="!isMobile"
              :tooltip="currentChatHistory?.searchEnabled ? $t('chat.clickTurnOffSearch') : $t('chat.clickTurnOnSearch')"
              :tooltip-help="$t('chat.searchHelp')"
              :class="{ 'text-[#4b9e5f]': currentChatHistory?.searchEnabled, 'text-[#a8071a]': !currentChatHistory?.searchEnabled }"
              @click="handleToggleSearchEnabled"
            >
              <span class="text-xl flex items-center">
                <SvgIcon icon="mdi:web" />
                <span class="ml-1 text-sm">{{ currentChatHistory?.searchEnabled ? $t('chat.searchEnabled') : $t('chat.searchDisabled') }}</span>
              </span>
            </HoverButton>
            <HoverButton
              v-if="!isMobile"
              :tooltip="currentChatHistory?.thinkEnabled ? $t('chat.clickTurnOffThink') : $t('chat.clickTurnOnThink')"
              :tooltip-help="$t('chat.thinkHelp')"
              :class="{ 'text-[#4b9e5f]': currentChatHistory?.thinkEnabled, 'text-[#a8071a]': !currentChatHistory?.thinkEnabled }"
              @click="handleToggleThinkEnabled"
            >
              <span class="text-xl flex items-center">
                <SvgIcon icon="mdi:lightbulb-outline" />
                <span class="ml-1 text-sm">{{ currentChatHistory?.thinkEnabled ? $t('chat.thinkEnabled') : $t('chat.thinkDisabled') }}</span>
              </span>
            </HoverButton>
            <HoverButton
              v-if="!isMobile"
              :tooltip="usingContext ? $t('chat.clickTurnOffContext') : $t('chat.clickTurnOnContext')"
              :tooltip-help="$t('chat.contextHelp')"
              :class="{ 'text-[#4b9e5f]': usingContext, 'text-[#a8071a]': !usingContext }"
              @click="handleToggleUsingContext"
            >
              <span class="text-xl flex items-center">
                <SvgIcon icon="ri:chat-history-line" />
                <span class="ml-1 text-sm">{{ usingContext ? $t('chat.showOnContext') : $t('chat.showOffContext') }}</span>
              </span>
            </HoverButton>
            <NSlider
              :value="currentChatHistory?.maxContextCount"
              :disabled="!usingContext"
              :max="40"
              :min="0"
              :step="1"
              style="width: 180px"
              :format-tooltip="(value: number) => `${t('chat.maxContextCount')}: ${value}`"
              :on-dragend="handleSyncMaxContextCount"
              @update:value="handleUpdateMaxContextCount"
            />
          </div>
          <div class="flex items-center justify-between space-x-2">
            <NAutoComplete v-model:value="prompt" :options="searchOptions" :render-label="renderOption">
              <template #default="{ handleInput, handleBlur, handleFocus }">
                <NInput
                  ref="inputRef"
                  v-model:value="prompt"
                  :disabled="!!authStore.session?.auth && !authStore.token && !authStore.session?.authProxyEnabled"
                  type="textarea"
                  :placeholder="placeholder"
                  :autosize="{ minRows: isMobile ? 1 : 4, maxRows: isMobile ? 4 : 8 }"
                  @input="handleInput"
                  @focus="handleFocus"
                  @blur="handleBlur"
                  @keypress="handleEnter"
                />
              </template>
            </NAutoComplete>
            <NButton type="primary" :disabled="buttonDisabled" @click="handleSubmit">
              <template #icon>
                <span class="dark:text-black">
                  <SvgIcon icon="ri:send-plane-fill" />
                </span>
              </template>
            </NButton>
          </div>
        </NSpace>
      </div>
    </footer>
    <Prompt v-if="showPrompt" v-model:room-id="uuid" v-model:visible="showPrompt" />
  </div>
</template>
