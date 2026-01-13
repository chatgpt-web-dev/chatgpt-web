<script setup lang='ts'>
import type { AutoCompleteProps, MessageReactive, UploadFileInfo } from 'naive-ui'
import html2canvas from 'html2canvas'
import { h } from 'vue'
import {
  fetchChatAPIProcessSSE,
  fetchChatResponseoHistory,
  fetchChatStopResponding,
} from '@/api'
import { HoverButton, PromptTypeTag, SvgIcon } from '@/components/common'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import IconPrompt from '@/icons/Prompt.vue'
import { useAuthStore, useChatStore, usePromptStore, useUserStore } from '@/store'
import { debounce } from '@/utils/functions/debounce'
import { compareRank } from '@/utils/lexorank'
import { Message } from './components'
import HeaderComponent from './components/Header/index.vue'
import { useChat } from './hooks/useChat'
import { useScroll } from './hooks/useScroll'

const { t } = useI18n()

const Prompt = defineAsyncComponent(() => import('@/components/common/Setting/Prompt.vue'))

let controller = new AbortController()

const openLongReply = import.meta.env.VITE_GLOB_OPEN_LONG_REPLY === 'true'

const route = useRoute()
const dialog = useDialog()
const ms = useMessage()
const authStore = useAuthStore()
const userStore = useUserStore()
const chatStore = useChatStore()

const { isMobile } = useBasicLayout()
const { updateChat, updateChatSome, getChatByUuidAndIndex } = useChat()
const { scrollRef, scrollToBottom, scrollToBottomIfAtBottom, scrollTo } = useScroll()

const { uuid } = route.params as { uuid: string }

const currentChatRoom = computed(() => chatStore.getChatRoomByCurrentActive)
const dataSources = computed(() => chatStore.getChatByUuid(+uuid))
const conversationList = computed(() => dataSources.value.filter(item => (!item.inversion && !!item.conversationOptions)))

const prompt = ref<string>('')
const firstLoading = ref<boolean>(false)
const loading = ref<boolean>(false)
const inputRef = ref<Ref | null>(null)
const showPrompt = ref(false)

const loadingChatUuid = ref<number>(-1)

const currentNavIndexRef = ref<number>(-1)

// Store the previous tool-call response ID for previousResponseId.
const lastToolResponseId = ref<string>('')

// Initialize lastToolResponseId from history.
function initLastToolResponseId() {
  // Traverse history to find the last message with editImageId.
  for (let i = dataSources.value.length - 1; i >= 0; i--) {
    const chat = dataSources.value[i]
    if (!chat.inversion && chat.editImageId) {
      lastToolResponseId.value = chat.editImageId
      return
    }
  }
  // Clear if none are found.
  lastToolResponseId.value = ''
}

let loadingms: MessageReactive
let allmsg: MessageReactive
let prevScrollTop: number

// Add PromptStore.
const promptStore = usePromptStore()

// Use storeToRefs so suggestions re-render after store updates.
// @ts-expect-error TS2339: Property 'promptList' does not exist on type 'StoreToRefs<any>'.
const { promptList: promptTemplate } = storeToRefs<any>(promptStore)

// Reset loading manually; it may not reset on page refresh.
dataSources.value.forEach((item, index) => {
  if (item.loading)
    updateChatSome(+uuid, index, { loading: false })
})

function handleSubmit() {
  onConversation()
}

// Store uploaded file info: fileKey for backend, fileUrl for UI.
interface UploadFileInfoItem {
  fileKey: string
  fileUrl?: string
}
const uploadFileKeysRef = ref<UploadFileInfoItem[]>([])

async function onConversation() {
  let message = prompt.value

  if (loading.value)
    return

  if (!message || message.trim() === '')
    return

  const uploadFileKeys = uploadFileKeysRef.value.map(item => item.fileUrl || item.fileKey)
  uploadFileKeysRef.value = []

  controller = new AbortController()

  const chatUuid = Date.now()
  loadingChatUuid.value = chatUuid

  await chatStore.addChatMessage(
    currentChatRoom.value!.roomId,
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
  await scrollToBottom()

  loading.value = true
  prompt.value = ''

  let options: Chat.ConversationRequest = {}
  const lastContext = conversationList.value[conversationList.value.length - 1]?.conversationOptions

  if (lastContext && currentChatRoom.value?.usingContext) {
    options = { ...lastContext }
  }
  else {
    // Clear lastToolResponseId for new chats without context.
    lastToolResponseId.value = ''
  }

  await chatStore.addChatMessage(
    currentChatRoom.value!.roomId,
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
  await scrollToBottom()

  try {
    let lastText = ''
    let accumulatedReasoning = ''
    const fetchChatAPIOnce = async () => {
      let searching: boolean | undefined
      let searchQuery: string
      let searchResults: Chat.SearchResult[]
      let searchUsageTime: number

      await fetchChatAPIProcessSSE({
        roomId: currentChatRoom.value!.roomId,
        uuid: chatUuid,
        prompt: message,
        uploadFileKeys,
        options,
        tools: currentChatRoom.value?.toolsEnabled ? [{ type: 'image_generation' }] : undefined,
        previousResponseId: currentChatRoom.value?.toolsEnabled && lastToolResponseId.value ? lastToolResponseId.value : undefined,
        signal: controller.signal,
      }, {
        onSearching: (data) => {
          searching = data.searching
          chatStore.updateChatMessage(
            currentChatRoom.value!.roomId,
            dataSources.value.length - 1,
            {
              searching: data.searching,
            },
          )
        },
        onGenerating: (data) => {
          chatStore.updateChatMessage(
            currentChatRoom.value!.roomId,
            dataSources.value.length - 1,
            {
              loading: data.generating,
            },
          )
        },
        onSearchQuery: (data) => {
          searchQuery = data.searchQuery
          searching = false
        },
        onSearchResults: (data) => {
          searchResults = data.searchResults
          searchUsageTime = data.searchUsageTime
        },
        onToolCalls: async (data) => {
          // Handle tool calls (e.g., image generation results)
          const toolCalls = data.tool_calls || []
          const imageToolCalls = toolCalls.filter((tool: any) => tool.type === 'image_generation' && tool.result)

          // Store previousResponseId (prefer editImageId, else response id).
          const editImageId = (data as any).editImageId
          const responseId = (data as any).id
          if (editImageId) {
            lastToolResponseId.value = editImageId
          }
          else if (responseId) {
            lastToolResponseId.value = responseId
          }

          if (imageToolCalls.length > 0) {
            // Extract file IDs from tool calls (now stored as file IDs instead of base64)
            const imageResults = imageToolCalls.map((tool: any) => tool.result)

            // Get current chat to preserve existing fields
            const currentChat = getChatByUuidAndIndex(currentChatRoom.value!.roomId, dataSources.value.length - 1)
            if (currentChat) {
              await chatStore.updateChatMessage(
                currentChatRoom.value!.roomId,
                dataSources.value.length - 1,
                {
                  ...currentChat,
                  tool_calls: toolCalls,
                  tool_images: imageResults, // Store file IDs instead of base64
                  editImageId: editImageId || undefined,
                },
              )
            }
          }
        },
        onDelta: async (delta) => {
          // Handle incremental data
          if (delta.text) {
            lastText += delta.text
          }
          if (delta.reasoning) {
            accumulatedReasoning += delta.reasoning
          }
          await chatStore.updateChatMessage(
            currentChatRoom.value!.roomId,
            dataSources.value.length - 1,
            {
              dateTime: new Date().toLocaleString(),
              searching,
              searchQuery,
              searchResults,
              searchUsageTime,
              reasoning: accumulatedReasoning,
              text: lastText,
              inversion: false,
              error: false,
              loading: true,
              conversationOptions: null,
              requestOptions: { prompt: message, options: { ...options } },
            },
          )

          await scrollToBottomIfAtBottom()
        },
        onMessage: async (data) => {
          // Handle complete message data (compatibility mode)
          if (data.searchQuery) {
            searchQuery = data.searchQuery
            searching = false
          }
          if (data.searchResults)
            searchResults = data.searchResults
          if (data.searchUsageTime)
            searchUsageTime = data.searchUsageTime

          const usage = (data.detail && data.detail.usage)
            ? {
                completion_tokens: data.detail.usage.completion_tokens || null,
                prompt_tokens: data.detail.usage.prompt_tokens || null,
                total_tokens: data.detail.usage.total_tokens || null,
                estimated: data.detail.usage.estimated || null,
              }
            : undefined

          await chatStore.updateChatMessage(
            currentChatRoom.value!.roomId,
            dataSources.value.length - 1,
            {
              dateTime: new Date().toLocaleString(),
              searching,
              searchQuery,
              searchResults,
              searchUsageTime,
              reasoning: data?.reasoning,
              text: data.text ?? '',
              inversion: false,
              error: false,
              loading: true,
              conversationOptions: { conversationId: data.conversationId, parentMessageId: data.id },
              requestOptions: { prompt: message, options: { ...options } },
              usage,
              tool_calls: data.tool_calls,
            },
          )

          if (openLongReply && data.detail && data.detail.choices?.length > 0 && data.detail.choices[0].finish_reason === 'length') {
            options.parentMessageId = data.id
            lastText = data.text
            message = ''
            return fetchChatAPIOnce()
          }

          await scrollToBottomIfAtBottom()
        },
        onComplete: async (data) => {
          // Handle complete event
          const usage = (data.detail && data.detail.usage)
            ? {
                completion_tokens: data.detail.usage.completion_tokens || null,
                prompt_tokens: data.detail.usage.prompt_tokens || null,
                total_tokens: data.detail.usage.total_tokens || null,
                estimated: data.detail.usage.estimated || null,
              }
            : undefined

          // Handle tool_calls and editImageId.
          const toolCalls = data.tool_calls || []
          const imageToolCalls = toolCalls.filter((tool: any) => tool.type === 'image_generation' && tool.result)
          const imageResults = imageToolCalls.map((tool: any) => tool.result)

          // Store editImageId (prefer editImageId, else response id).
          const editImageId = data.editImageId
          const responseId = data.id
          if (editImageId) {
            lastToolResponseId.value = editImageId
          }
          else if (responseId) {
            lastToolResponseId.value = responseId
          }

          await chatStore.updateChatMessage(
            currentChatRoom.value!.roomId,
            dataSources.value.length - 1,
            {
              dateTime: new Date().toLocaleString(),
              searching: false,
              searchQuery,
              searchResults,
              searchUsageTime,
              reasoning: data?.reasoning || accumulatedReasoning,
              text: data?.text || lastText,
              inversion: false,
              error: false,
              loading: false,
              conversationOptions: { conversationId: data.conversationId, parentMessageId: data.id },
              requestOptions: { prompt: message, options: { ...options } },
              usage,
              tool_calls: toolCalls,
              tool_images: imageResults.length > 0 ? imageResults : undefined,
              editImageId: editImageId || undefined,
            },
          )
        },
        onError: async (error) => {
          await chatStore.updateChatMessage(
            currentChatRoom.value!.roomId,
            dataSources.value.length - 1,
            {
              dateTime: new Date().toLocaleString(),
              text: error,
              inversion: false,
              error: true,
              loading: false,
              conversationOptions: null,
              requestOptions: { prompt: message, options: { ...options } },
            },
          )
        },
        onEnd: () => {
          updateChatSome(currentChatRoom.value!.roomId, dataSources.value.length - 1, { loading: false })
        },
      })
    }

    await fetchChatAPIOnce()
  }
  catch (error: any) {
    const errorMessage = error?.message ?? t('common.wrong')

    if (error.message === 'canceled') {
      updateChatSome(
        currentChatRoom.value!.roomId,
        dataSources.value.length - 1,
        {
          loading: false,
        },
      )
      await scrollToBottomIfAtBottom()
      return
    }

    const currentChat = getChatByUuidAndIndex(currentChatRoom.value!.roomId, dataSources.value.length - 1)

    if (currentChat?.text && currentChat.text !== '') {
      updateChatSome(
        currentChatRoom.value!.roomId,
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
      currentChatRoom.value!.roomId,
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
  loadingChatUuid.value = chatUuid!
  updateChat(
    currentChatRoom.value!.roomId,
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
    let accumulatedReasoning = ''
    const fetchChatAPIOnce = async () => {
      let searching: boolean | undefined
      let searchQuery: string
      let searchResults: Chat.SearchResult[]
      let searchUsageTime: number

      await fetchChatAPIProcessSSE({
        roomId: currentChatRoom.value!.roomId,
        uuid: chatUuid || Date.now(),
        regenerate: true,
        prompt: message,
        options,
        tools: currentChatRoom.value?.toolsEnabled ? [{ type: 'image_generation' }] : undefined,
        previousResponseId: currentChatRoom.value?.toolsEnabled && lastToolResponseId.value ? lastToolResponseId.value : undefined,
        signal: controller.signal,
      }, {
        onSearching: (data) => {
          searching = data.searching
          chatStore.updateChatMessage(
            currentChatRoom.value!.roomId,
            dataSources.value.length - 1,
            {
              searching: data.searching,
            },
          )
        },
        onGenerating: (data) => {
          updateChatSome(
            currentChatRoom.value!.roomId,
            index,
            {
              loading: data.generating,
            },
          )
        },
        onSearchQuery: (data) => {
          searchQuery = data.searchQuery
          searching = false
        },
        onSearchResults: (data) => {
          searchResults = data.searchResults
          searchUsageTime = data.searchUsageTime
        },
        onToolCalls: async (data) => {
          // Handle tool calls (e.g., image generation results)
          const toolCalls = data.tool_calls || []
          const imageToolCalls = toolCalls.filter((tool: any) => tool.type === 'image_generation' && tool.result)

          // Store previousResponseId (prefer editImageId, else response id).
          const editImageId = (data as any).editImageId
          const responseId = (data as any).id
          if (editImageId) {
            lastToolResponseId.value = editImageId
          }
          else if (responseId) {
            lastToolResponseId.value = responseId
          }

          if (imageToolCalls.length > 0) {
            // Extract file IDs from tool calls (now stored as file IDs instead of base64)
            const imageResults = imageToolCalls.map((tool: any) => tool.result)

            // Get current chat to preserve existing fields
            const currentChat = getChatByUuidAndIndex(currentChatRoom.value!.roomId, index)
            if (currentChat) {
              updateChat(
                currentChatRoom.value!.roomId,
                index,
                {
                  ...currentChat,
                  tool_calls: toolCalls,
                  tool_images: imageResults, // Store file IDs instead of base64
                  editImageId: editImageId || undefined,
                },
              )
            }
          }
        },
        onDelta: async (delta) => {
          // Handle incremental data.
          if (delta.text) {
            lastText += delta.text
          }
          if (delta.reasoning) {
            accumulatedReasoning += delta.reasoning
          }

          updateChat(
            currentChatRoom.value!.roomId,
            index,
            {
              dateTime: new Date().toLocaleString(),
              searching,
              searchQuery,
              searchResults,
              searchUsageTime,
              reasoning: accumulatedReasoning,
              text: lastText,
              inversion: false,
              responseCount,
              error: false,
              loading: true,
              conversationOptions: null,
              requestOptions: { prompt: message, options: { ...options } },
            },
          )

          scrollToBottomIfAtBottom()
        },
        onMessage: async (data) => {
          // Handle complete message data (compatibility mode)
          if (data.searchQuery) {
            searchQuery = data.searchQuery
            searching = false
          }
          if (data.searchResults)
            searchResults = data.searchResults
          if (data.searchUsageTime)
            searchUsageTime = data.searchUsageTime
          // Handle complete message data (compatibility mode)
          const usage = (data.detail && data.detail.usage)
            ? {
                completion_tokens: data.detail.usage.completion_tokens || null,
                prompt_tokens: data.detail.usage.prompt_tokens || null,
                total_tokens: data.detail.usage.total_tokens || null,
                estimated: data.detail.usage.estimated || null,
              }
            : undefined
          updateChat(
            currentChatRoom.value!.roomId,
            index,
            {
              dateTime: new Date().toLocaleString(),
              searching,
              searchQuery,
              searchResults,
              searchUsageTime,
              reasoning: data?.reasoning,
              finish_reason: data?.finish_reason,
              text: data.text ?? '',
              inversion: false,
              responseCount,
              error: false,
              loading: true,
              conversationOptions: { conversationId: data.conversationId, parentMessageId: data.id },
              requestOptions: { prompt: message, options: { ...options } },
              usage,
              tool_calls: data.tool_calls,
            },
          )

          if (openLongReply && data.detail && data.detail.choices?.length > 0 && data.detail.choices[0].finish_reason === 'length') {
            options.parentMessageId = data.id
            lastText = data.text
            message = ''
            return fetchChatAPIOnce()
          }

          scrollToBottomIfAtBottom()
        },
        onComplete: async (data) => {
          // Handle completion event.
          const usage = (data.detail && data.detail.usage)
            ? {
                completion_tokens: data.detail.usage.completion_tokens || null,
                prompt_tokens: data.detail.usage.prompt_tokens || null,
                total_tokens: data.detail.usage.total_tokens || null,
                estimated: data.detail.usage.estimated || null,
              }
            : undefined
          updateChat(
            currentChatRoom.value!.roomId,
            index,
            {
              dateTime: new Date().toLocaleString(),
              searching: false,
              searchQuery,
              searchResults,
              searchUsageTime,
              reasoning: data?.reasoning || accumulatedReasoning,
              finish_reason: data?.finish_reason,
              text: data?.text || lastText,
              inversion: false,
              responseCount,
              error: false,
              loading: false,
              conversationOptions: { conversationId: data.conversationId, parentMessageId: data.id },
              requestOptions: { prompt: message, options: { ...options } },
              usage,
              tool_calls: data.tool_calls,
            },
          )
        },
        onError: async (error) => {
          updateChat(
            currentChatRoom.value!.roomId,
            index,
            {
              dateTime: new Date().toLocaleString(),
              text: error,
              inversion: false,
              responseCount,
              error: true,
              loading: false,
              conversationOptions: null,
              requestOptions: { prompt: message, options: { ...options } },
            },
          )
        },
        onEnd: () => {
          updateChatSome(currentChatRoom.value!.roomId, index, { loading: false })
        },
      })
    }
    await fetchChatAPIOnce()
  }
  catch (error: any) {
    if (error.message === 'canceled') {
      updateChatSome(
        currentChatRoom.value!.roomId,
        index,
        {
          loading: false,
        },
      )
      return
    }

    const errorMessage = error?.message ?? t('common.wrong')

    updateChat(
      currentChatRoom.value!.roomId,
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
  const chat = (await fetchChatResponseoHistory(currentChatRoom.value!.roomId, dataSources.value[index].uuid || Date.now(), historyIndex)).data
  updateChat(
    currentChatRoom.value!.roomId,
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
    chatStore.deleteChatByUuid(currentChatRoom.value!.roomId, index)
  }
  else {
    dialog.warning({
      title: t('chat.deleteMessage'),
      content: t('chat.deleteMessageConfirm'),
      positiveText: t('common.yes'),
      negativeText: t('common.no'),
      onPositiveClick: () => {
        chatStore.deleteChatByUuid(currentChatRoom.value!.roomId, index)
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
      chatStore.clearChatByUuid(currentChatRoom.value!.roomId)
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
    await fetchChatStopResponding(loadingChatUuid.value)
  }
}

async function loadMoreMessage(event: any) {
  const chatIndex = chatStore.chat.findIndex(d => d.roomId === currentChatRoom.value!.roomId)
  if (chatIndex <= -1 || chatStore.chat[chatIndex].data.length <= 0)
    return

  const scrollPosition = event.target.scrollHeight - event.target.scrollTop

  const lastId = chatStore.chat[chatIndex].data[0].uuid
  await chatStore.syncChat({ roomId: currentChatRoom.value!.roomId } as Chat.ChatRoom, lastId, () => {
    loadingms && loadingms.destroy()
    // Reinitialize lastToolResponseId after loading more messages.
    initLastToolResponseId()
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
    // Direct refresh may skip requests in rare cases.
    chatStore.syncChat({ roomId: Number(uuid) } as Chat.ChatRoom, undefined, () => {
      firstLoading.value = false
      // Initialize lastToolResponseId from history.
      initLastToolResponseId()
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
  if (!currentChatRoom.value)
    return

  await chatStore.setChatSearchEnabled(!currentChatRoom.value.searchEnabled)
  if (currentChatRoom.value.searchEnabled)
    ms.success(t('chat.turnOnSearch'))
  else
    ms.warning(t('chat.turnOffSearch'))
}

async function handleToggleThinkEnabled() {
  if (!currentChatRoom.value)
    return

  await chatStore.setChatThinkEnabled(!currentChatRoom.value.thinkEnabled)
  if (currentChatRoom.value.thinkEnabled)
    ms.success(t('chat.turnOnThink'))
  else
    ms.warning(t('chat.turnOffThink'))
}

async function handleToggleUsingContext() {
  if (!currentChatRoom.value)
    return

  await chatStore.setUsingContext(!currentChatRoom.value.usingContext)
  if (currentChatRoom.value.usingContext)
    ms.success(t('chat.turnOnContext'))
  else
    ms.warning(t('chat.turnOffContext'))
}

// Areas for optimization.
// Search option calculation uses value as key, causing duplicate-value render issues.
// Ideally key should be used, but renderOption has issues, so value maps back to label.
const promptTemplateSorted = computed(() => {
  const sortedPrompts = [...promptTemplate.value].sort((a: { order?: string }, b: { order?: string }) => {
    return compareRank(a.order, b.order)
  })
  const userPrompts = sortedPrompts.filter((item: { type?: string }) => item.type !== 'built-in')
  const builtInPrompts = sortedPrompts.filter((item: { type?: string }) => item.type === 'built-in')
  return [...userPrompts, ...builtInPrompts]
})

const promptValueById = computed(() => {
  const map = new Map<string, string>()
  promptTemplateSorted.value.forEach((item: { _id?: string, value?: string }) => {
    if (item._id)
      map.set(item._id, item.value ?? '')
  })
  return map
})

const searchOptions = computed(() => {
  const promptOptions = promptTemplateSorted.value
  if (prompt.value.startsWith('/')) {
    return promptOptions
      .filter((item: { title: string }) => item.title.toLowerCase().includes(prompt.value.substring(1).toLowerCase()))
      .map((obj: { value: any, _id?: string, type?: 'built-in' | 'user-defined', title?: string }) => {
        return {
          label: obj.value,
          value: obj._id ?? '',
          title: obj.title,
          type: obj.type ?? 'user-defined',
        }
      })
  }
  else {
    return []
  }
})

// Map value back to key label.
function renderOption(option: { label: string, title?: string, type?: 'built-in' | 'user-defined' }) {
  if (option.title) {
    return [
      h(PromptTypeTag, { type: option.type ?? 'user-defined' }),
      h('span', { style: { marginLeft: '8px' } }),
      option.title,
    ]
  }
  return []
}

type AutoCompleteOnSelect = NonNullable<AutoCompleteProps['onSelect']> extends Array<infer T>
  ? T
  : NonNullable<AutoCompleteProps['onSelect']>

const handlePromptSelect: AutoCompleteOnSelect = (value) => {
  const selectedValue = promptValueById.value.get(String(value))
  if (selectedValue !== undefined)
    prompt.value = selectedValue
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

// Check if it's an external chat site (format: external:name:url)
function isExternalModel(value: string): boolean {
  return value.startsWith('external:')
}

// Extract URL from external chat site value
function getExternalModelUrl(value: string): string | null {
  if (!isExternalModel(value))
    return null
  const parts = value.split(':')
  if (parts.length >= 3)
    return parts.slice(2).join(':') // Handle URLs that may contain : symbol
  return null
}

const chatModelOptions = computed(() => {
  const baseModels = authStore.session?.chatModels ?? []
  const externalSites = authStore.session?.externalChatSites ?? []

  // Convert external chat sites to model options format
  const externalOptions = externalSites.map(site => ({
    label: site.name,
    key: `external:${site.name}`,
    value: `external:${site.name}:${site.url}`,
  }))

  return [...baseModels, ...externalOptions]
})

function renderChatModelLabel(option: { label: string, value: string }, _selected: boolean) {
  if (isExternalModel(option.value)) {
    return h('span', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
      option.label,
      h(SvgIcon, {
        icon: 'ri:external-link-line',
        style: { fontSize: '14px', color: 'var(--n-text-color-secondary)' },
      }),
    ])
  }
  return option.label
}

async function handleSyncChatModel(chatModel: string) {
  // Check if it's an external chat site, open in new tab if so
  if (isExternalModel(chatModel)) {
    const url = getExternalModelUrl(chatModel)
    if (url) {
      const w = window.open(url, '_blank', 'noopener,noreferrer')
      if (w)
        w.opener = null
    }
    return
  }

  // Save previous model and toolsEnabled state before switching
  const previousModel = currentChatRoom.value?.chatModel
  const previousToolsEnabled = currentChatRoom.value?.toolsEnabled ?? false

  await chatStore.setChatModel(chatModel)
  const newToolsEnabled = currentChatRoom.value?.toolsEnabled ?? false
  if (previousToolsEnabled !== newToolsEnabled) {
    // Check whether the current room has history.
    const hasHistory = dataSources.value.length > 0

    // If no history, skip modal and clear lastToolResponseId.
    if (!hasHistory) {
      lastToolResponseId.value = ''
      return
    }

    // If history exists, prompt to start a new session.
    const d = dialog.warning({
      title: '切换模型提示',
      content: '检测到工具调用功能状态已变化，为避免混用，是否新开一个会话？',
      positiveText: t('common.yes'),
      negativeText: t('common.no'),
      closable: false,
      maskClosable: false,
      onPositiveClick: async () => {
        try {
          if (previousModel) {
            await chatStore.setChatModel(previousModel)
          }
          await chatStore.addNewChatRoom(chatModel)
          await chatStore.setChatModel(chatModel)
          lastToolResponseId.value = ''
        }
        finally {
          d.destroy()
        }
      },
      onNegativeClick: async () => {
        try {
          // User chose not to switch; revert to the previous model.
          if (previousModel) {
            await chatStore.setChatModel(previousModel)
          }
        }
        finally {
          d.destroy()
        }
      },
    })
  }
}

function handleUpdateMaxContextCount(maxContextCount: number) {
  if (currentChatRoom.value) {
    currentChatRoom.value.maxContextCount = maxContextCount
  }
}

async function handleSyncMaxContextCount() {
  if (!currentChatRoom.value)
    return

  await chatStore.setMaxContextCount(currentChatRoom.value.maxContextCount)
}

// https://github.com/tusen-ai/naive-ui/issues/4887
function handleFinish(options: { file: UploadFileInfo, event?: ProgressEvent }) {
  if (options.file.status === 'finished') {
    try {
      let responseData: any
      const file = options.file as any

      if (file.response) {
        responseData = file.response
      }
      else if (options.event?.target) {
        const response = (options.event.target as XMLHttpRequest).response
        responseData = typeof response === 'string' ? JSON.parse(response) : response
      }
      else {
        console.error('无法获取上传响应数据')
        return
      }

      // Validate response data shape.
      if (responseData && responseData.status === 'Success' && responseData.data?.fileKey) {
        const fileInfo = {
          fileKey: responseData.data.fileKey,
          fileUrl: responseData.data.fileUrl,
        }
        uploadFileKeysRef.value.push(fileInfo)
      }
      else {
        console.error('上传响应数据格式错误:', responseData)
      }
    }
    catch (error) {
      console.error('处理上传完成事件失败:', error)
    }
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

// Supported image types.
const VALID_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

// Paste image.
async function handlePasteImage(event: ClipboardEvent) {
  // Check if image upload is enabled.
  if (!currentChatRoom.value?.imageUploadEnabled) {
    ms.warning(t('chat.imageUploadDisabled') || '图片上传功能已关闭', {
      duration: 2000,
    })
    return
  }

  const items = event.clipboardData?.items
  if (!items || items.length === 0)
    return

  // Find image clipboard items.
  const imageItem = Array.from(items).find(item => item.type.includes('image'))
  if (!imageItem)
    return

  event.preventDefault() // 阻止默认粘贴行为

  const file = imageItem.getAsFile()
  if (!file) {
    ms.warning(t('chat.imageUploadFailed') || '无法获取图片文件', {
      duration: 2000,
    })
    return
  }

  // Validate file type.
  if (!VALID_IMAGE_TYPES.includes(file.type)) {
    ms.warning(t('chat.invalidImageType') || '不支持的图片格式，仅支持 PNG、JPEG、WEBP', {
      duration: 2000,
    })
    return
  }

  try {
    // Create FormData.
    const formData = new FormData()
    formData.append('file', file)

    // Upload image.
    const response = await fetch('/api/upload-image', {
      method: 'POST',
      headers: uploadHeaders.value,
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    if (result.status === 'Success' && result.data?.fileKey) {
      uploadFileKeysRef.value.push({
        fileKey: result.data.fileKey,
        fileUrl: result.data.fileUrl,
      })
      ms.success(t('chat.imageUploadSuccess') || '图片上传成功', {
        duration: 1500,
      })
    }
    else {
      ms.error(result.message || t('chat.imageUploadFailed') || '图片上传失败', {
        duration: 2000,
      })
    }
  }
  catch (error) {
    console.error('上传图片失败:', error)
    ms.error(t('chat.imageUploadFailed') || '图片上传失败', {
      duration: 2000,
    })
  }
}

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

// Watch dataSources to update lastToolResponseId automatically.
// Use immediate: false to avoid duplicate init calls (handleSyncChat already runs).
watch(() => dataSources.value.length, () => {
  // Update only when data length changes (history loaded).
  nextTick(() => {
    initLastToolResponseId()
  })
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
      :using-context="currentChatRoom?.usingContext"
      :show-prompt="showPrompt"
      :search-enabled="currentChatRoom?.searchEnabled"
      :think-enabled="currentChatRoom?.thinkEnabled"
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
                  :searching="item?.searching"
                  :search-query="item?.searchQuery"
                  :search-results="item?.searchResults"
                  :search-usage-time="item?.searchUsageTime"
                  :reasoning="item?.reasoning"
                  :finish-reason="item?.finish_reason"
                  :text="item.text"
                  :images="item.images"
                  :tool-images="item.tool_images"
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
              <img
                v-for="(v, i) of uploadFileKeysRef"
                :key="i"
                :src="v.fileUrl || `/uploads/${v.fileKey}`"
                class="max-h-10"
                :alt="`上传的图片 ${i + 1}`"
                @error="(e) => { console.error('图片加载失败:', v.fileUrl || `/uploads/${v.fileKey}`, e); (e.target as HTMLImageElement).style.display = 'none' }"
              >
              <HoverButton @click="handleDeleteUploadFile">
                <span class="text-xl text-[#4f555e] dark:text-white">
                  <SvgIcon icon="ri:delete-back-2-fill" />
                </span>
              </HoverButton>
            </NSpace>
          </div>

          <div class="flex items-center space-x-2">
            <div v-if="currentChatRoom?.imageUploadEnabled">
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
              :value="currentChatRoom?.chatModel"
              :options="chatModelOptions"
              :disabled="!!authStore.session?.auth && !authStore.token && !authStore.session?.authProxyEnabled"
              :render-label="renderChatModelLabel"
              @update:value="handleSyncChatModel"
            />
            <HoverButton
              v-if="!isMobile"
              :tooltip="currentChatRoom?.searchEnabled ? t('chat.clickTurnOffSearch') : t('chat.clickTurnOnSearch')"
              :tooltip-help="t('chat.searchHelp')"
              :class="{ 'text-[#4b9e5f]': currentChatRoom?.searchEnabled, 'text-[#a8071a]': !currentChatRoom?.searchEnabled }"
              @click="handleToggleSearchEnabled"
            >
              <span class="text-xl flex items-center">
                <SvgIcon icon="mdi:web" />
                <span class="ml-1 text-sm">{{ currentChatRoom?.searchEnabled ? t('chat.searchEnabled') : t('chat.searchDisabled') }}</span>
              </span>
            </HoverButton>
            <HoverButton
              v-if="!isMobile"
              :tooltip="currentChatRoom?.thinkEnabled ? t('chat.clickTurnOffThink') : t('chat.clickTurnOnThink')"
              :tooltip-help="t('chat.thinkHelp')"
              :class="{ 'text-[#4b9e5f]': currentChatRoom?.thinkEnabled, 'text-[#a8071a]': !currentChatRoom?.thinkEnabled }"
              @click="handleToggleThinkEnabled"
            >
              <span class="text-xl flex items-center">
                <SvgIcon icon="mdi:lightbulb-outline" />
                <span class="ml-1 text-sm">{{ currentChatRoom?.thinkEnabled ? t('chat.thinkEnabled') : t('chat.thinkDisabled') }}</span>
              </span>
            </HoverButton>
            <HoverButton
              v-if="!isMobile"
              :tooltip="currentChatRoom?.usingContext ? t('chat.clickTurnOffContext') : t('chat.clickTurnOnContext')"
              :tooltip-help="t('chat.contextHelp')"
              :class="{ 'text-[#4b9e5f]': currentChatRoom?.usingContext, 'text-[#a8071a]': !currentChatRoom?.usingContext }"
              @click="handleToggleUsingContext"
            >
              <span class="text-xl flex items-center">
                <SvgIcon icon="ri:chat-history-line" />
                <span class="ml-1 text-sm">{{ currentChatRoom?.usingContext ? t('chat.showOnContext') : t('chat.showOffContext') }}</span>
              </span>
            </HoverButton>
            <NSlider
              :value="currentChatRoom?.maxContextCount"
              :disabled="!currentChatRoom?.usingContext"
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
            <NAutoComplete v-model:value="prompt" :options="searchOptions" :render-label="renderOption" @select="handlePromptSelect">
              <template #default="{ handleInput, handleBlur, handleFocus }">
                <NInput
                  ref="inputRef"
                  v-model:value="prompt"
                  :disabled="!!authStore.session?.auth && !authStore.token && !authStore.session?.authProxyEnabled"
                  type="textarea"
                  :placeholder="placeholder"
                  :autosize="{ minRows: isMobile ? 2 : 3, maxRows: isMobile ? 4 : 12 }"
                  @input="handleInput"
                  @focus="handleFocus"
                  @blur="handleBlur"
                  @keypress="handleEnter"
                  @paste="handlePasteImage"
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
