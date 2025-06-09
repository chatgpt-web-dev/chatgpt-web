import {
  fetchClearChat,
  fetchCreateChatRoom,
  fetchDeleteChat,
  fetchDeleteChatRoom,
  fetchGetChatHistory,
  fetchGetChatRooms,
  fetchRenameChatRoom,
  fetchUpdateChatRoomChatModel,
  fetchUpdateChatRoomMaxContextCount,
  fetchUpdateChatRoomSearchEnabled,
  fetchUpdateChatRoomThinkEnabled,
  fetchUpdateChatRoomUsingContext,
  fetchUpdateUserChatModel,
  fetchUpdateUserMaxContextCount,
} from '@/api'
import { router } from '@/router'
import { useUserStore } from '../user'

class ChatState {
  active: number | null = null
  chatRooms: Chat.ChatRoom[] = []
  chat: { roomId: number, data: Chat.Chat[] }[] = []
}

export const useChatStore = defineStore('chat-store', () => {
  const state = reactive<ChatState>(new ChatState())

  const reloadRoute = async (roomId?: number) => {
    await router.push({ name: 'Chat', params: { uuid: roomId } })
  }

  const findRoomIndex = (roomId: number | null) => state.chatRooms.findIndex(item => item.roomId === roomId)
  const findChatIndex = (roomId: number) => state.chat.findIndex(item => item.roomId === roomId)
  const getCurrentUuid = (uuid?: number) => uuid || state.active || state.chat[0]?.roomId

  // Getters
  const getChatRoomByCurrentActive = computed(() =>
    state.chatRooms.find(item => item.roomId === state.active) || null,
  )

  const getChatByUuid = computed(() => (uuid?: number) => {
    const targetUuid = getCurrentUuid(uuid)
    return state.chat.find(item => item.roomId === targetUuid)?.data ?? []
  })

  // Actions
  const addNewChatRoom = async () => {
    const title = 'New Chat'
    const roomId = Date.now()
    const result = await fetchCreateChatRoom(title, roomId)

    state.chatRooms.unshift({
      title,
      roomId,
      isEdit: false,
      chatModel: result.data?.chatModel,
      usingContext: result.data?.usingContext ?? true,
      maxContextCount: result.data?.maxContextCount ?? 10,
      searchEnabled: result.data?.searchEnabled,
      thinkEnabled: result.data?.thinkEnabled,
    })

    state.chat.unshift({ roomId, data: [] })
    state.active = roomId
    await reloadRoute(roomId)
  }

  const syncHistory = async () => {
    const rooms = (await fetchGetChatRooms()).data
    if (rooms.length === 0) {
      return await addNewChatRoom()
    }

    state.chatRooms = []
    state.chat = []

    rooms.forEach((r: Chat.ChatRoom) => {
      state.chatRooms.unshift(r)
      state.chat.unshift({ roomId: r.roomId, data: [] })
    })
    if (!rooms.find((item: Chat.ChatRoom) => item.roomId === state.active)) {
      state.active = state.chatRooms[0].roomId
      await reloadRoute(state.active!)
    }
  }

  const syncChat = async (room: Chat.ChatRoom, lastId?: number, callback?: () => void, onStart?: () => void, onEmpty?: () => void) => {
    if (!room.roomId)
      return callback?.()

    const roomIndex = findRoomIndex(room.roomId)
    if (roomIndex === -1 || state.chatRooms[roomIndex].loading || state.chatRooms[roomIndex].all) {
      if (lastId === undefined)
        callback?.()
      if (state.chatRooms[roomIndex]?.all)
        onEmpty?.()
      return
    }

    try {
      state.chatRooms[roomIndex].loading = true
      const chatIndex = findChatIndex(room.roomId)

      if (chatIndex === -1 || state.chat[chatIndex].data.length === 0 || lastId !== undefined) {
        onStart?.()
        const chatData = (await fetchGetChatHistory(room.roomId, lastId)).data

        if (chatData.length === 0) {
          state.chatRooms[roomIndex].all = true
        }
        else {
          if (chatIndex === -1) {
            state.chat.unshift({ roomId: room.roomId, data: chatData })
          }
          else {
            state.chat[chatIndex].data.unshift(...chatData)
          }
        }
      }
    }
    finally {
      state.chatRooms[roomIndex].loading = false
      if (state.chatRooms[roomIndex].all)
        onEmpty?.()
      callback?.()
    }
  }

  const setUsingContext = async (usingContext: boolean) => {
    const index = findRoomIndex(state.active)
    if (index === -1)
      return

    state.chatRooms[index].usingContext = usingContext
    await fetchUpdateChatRoomUsingContext(usingContext, state.active!)
  }

  const setMaxContextCount = async (maxContextCount: number) => {
    const index = findRoomIndex(state.active)
    if (index === -1)
      return

    state.chatRooms[index].maxContextCount = maxContextCount
    await fetchUpdateChatRoomMaxContextCount(maxContextCount, state.active!)

    const userStore = useUserStore()
    userStore.userInfo.config.maxContextCount = maxContextCount
    await fetchUpdateUserMaxContextCount(maxContextCount)
  }

  const setChatModel = async (chatModel: string) => {
    const index = findRoomIndex(state.active)
    if (index === -1)
      return

    state.chatRooms[index].chatModel = chatModel
    await fetchUpdateChatRoomChatModel(chatModel, state.active!)

    const userStore = useUserStore()
    userStore.userInfo.config.chatModel = chatModel
    await fetchUpdateUserChatModel(chatModel)
  }

  const setChatSearchEnabled = async (searchEnabled: boolean) => {
    const index = findRoomIndex(state.active)
    if (index === -1)
      return

    state.chatRooms[index].searchEnabled = searchEnabled
    await fetchUpdateChatRoomSearchEnabled(searchEnabled, state.active!)
  }

  const setChatThinkEnabled = async (thinkEnabled: boolean) => {
    const index = findRoomIndex(state.active)
    if (index === -1) {
      return
    }

    state.chatRooms[index].thinkEnabled = thinkEnabled
    await fetchUpdateChatRoomThinkEnabled(thinkEnabled, state.active!)
  }

  const updateChatRoom = async (uuid: number, edit: Partial<Chat.ChatRoom>) => {
    const index = findRoomIndex(uuid)
    if (index === -1)
      return

    state.chatRooms[index] = { ...state.chatRooms[index], ...edit }

    if (!edit.isEdit)
      await fetchRenameChatRoom(state.chatRooms[index].title, uuid)
  }

  const deleteChatRoom = async (index: number) => {
    await fetchDeleteChatRoom(state.chatRooms[index].roomId)
    state.chatRooms.splice(index, 1)
    state.chat.splice(index, 1)

    if (state.chatRooms.length === 0)
      return await addNewChatRoom()

    const nextIndex = Math.min(index, state.chatRooms.length - 1)
    const roomId = state.chatRooms[nextIndex].roomId
    state.active = roomId
    await reloadRoute(roomId)
  }

  const setActive = async (roomId: number) => {
    state.active = roomId
    return await reloadRoute(roomId)
  }

  const getChatByUuidAndIndex = (uuid: number, index: number) => {
    const targetUuid = getCurrentUuid(uuid)
    const chatIndex = findChatIndex(targetUuid)
    return chatIndex !== -1 ? state.chat[chatIndex].data[index] : null
  }

  const addChatByUuid = async (uuid: number, chatItem: Chat.Chat) => {
    const targetUuid = getCurrentUuid(uuid)
    const chatIndex = findChatIndex(targetUuid)

    if (state.chatRooms[chatIndex]?.title === 'New Chat') {
      state.chatRooms[chatIndex].title = chatItem.text
      await fetchRenameChatRoom(chatItem.text, state.chatRooms[chatIndex].roomId)
    }
  }

  const updateChatByUuid = (uuid: number, index: number, chatItem: Chat.Chat | Partial<Chat.Chat>) => {
    const targetUuid = getCurrentUuid(uuid)
    const chatIndex = findChatIndex(targetUuid)

    if (chatIndex !== -1 && state.chat[chatIndex].data[index]) {
      const existingUuid = state.chat[chatIndex].data[index].uuid
      state.chat[chatIndex].data[index] = { ...state.chat[chatIndex].data[index], ...chatItem, uuid: existingUuid }
    }
  }

  const deleteChatByUuid = async (uuid: number, index: number) => {
    const targetUuid = getCurrentUuid(uuid)
    const chatIndex = findChatIndex(targetUuid)

    if (chatIndex !== -1 && state.chat[chatIndex].data[index]) {
      const chatData = state.chat[chatIndex].data[index]
      await fetchDeleteChat(targetUuid, chatData.uuid || 0, chatData.inversion)
      state.chat[chatIndex].data.splice(index, 1)
    }
  }

  const clearChatByUuid = async (uuid: number) => {
    const targetUuid = getCurrentUuid(uuid)
    const chatIndex = findChatIndex(targetUuid)

    if (chatIndex !== -1) {
      await fetchClearChat(targetUuid)
      state.chat[chatIndex].data = []
    }
  }

  const clearLocalChat = async () => {
    state.chat = []
    state.chatRooms = []
    state.active = null
    await router.push({ name: 'Chat' })
  }

  return {
    // State
    ...toRefs(state),

    // Getters
    getChatRoomByCurrentActive,
    getChatByUuid,

    // Actions
    syncHistory,
    syncChat,
    setUsingContext,
    setMaxContextCount,
    setChatModel,
    setChatSearchEnabled,
    setChatThinkEnabled,
    addNewChatRoom,
    updateChatRoom,
    deleteChatRoom,
    setActive,
    getChatByUuidAndIndex,
    addChatByUuid,
    updateChatByUuid,
    updateChatSomeByUuid: updateChatByUuid,
    deleteChatByUuid,
    clearChatByUuid,
    clearLocalChat,
  }
})
