import {
  fetchClearChat,
  fetchCreateChatRoom,
  fetchDeleteChat,
  fetchDeleteChatRoom,
  fetchGetChatHistory,
  fetchGetChatRooms,
  fetchRenameChatRoom,
  fetchUpdateChatRoomChatModel,
  fetchUpdateChatRoomSearchEnabled,
  fetchUpdateChatRoomThinkEnabled,
  fetchUpdateChatRoomUsingContext,
  fetchUpdateUserChatModel,
} from '@/api'
import { router } from '@/router'
import { useUserStore } from '../user'
import { getLocalState, setLocalState } from './helper'

export const useChatStore = defineStore('chat-store', () => {
  const initialState = getLocalState()
  const chat = ref(initialState.chat)
  const chatRooms = ref(initialState.chatRooms)
  const active = ref(initialState.active)

  // Helpers
  const recordState = () => setLocalState({ chat: chat.value, chatRooms: chatRooms.value, active: active.value, usingContext: true })

  const reloadRoute = async (roomId?: number) => {
    recordState()
    await router.push({ name: 'Chat', params: { uuid: roomId } })
  }

  const findChatIndex = (uuid: number) => chat.value.findIndex(item => item.roomId === uuid)
  const findRoomIndex = (uuid: number) => chatRooms.value.findIndex(item => item.roomId === uuid)
  const getCurrentUuid = (uuid?: number) => uuid || active.value || chat.value[0]?.roomId

  // Getters
  const getChatRoomByCurrentActive = computed(() =>
    chatRooms.value.find(item => item.roomId === active.value) || null,
  )

  const getChatByUuid = computed(() => (uuid?: number) => {
    const targetUuid = getCurrentUuid(uuid)
    return chat.value.find(item => item.roomId === targetUuid)?.data ?? []
  })

  // Actions
  const addNewChatRoom = async () => {
    const title = 'New Chat'
    const roomId = Date.now()
    const result = await fetchCreateChatRoom(title, roomId)

    chatRooms.value.unshift({
      title,
      roomId,
      isEdit: false,
      chatModel: result.data?.chatModel,
      usingContext: result.data?.usingContext ?? true,
      maxContextCount: result.data?.maxContextCount ?? 10,
      searchEnabled: result.data?.searchEnabled,
      thinkEnabled: result.data?.thinkEnabled,
    })

    chat.value.unshift({ roomId, data: [] })
    active.value = roomId
    await reloadRoute(roomId)
  }

  const syncHistory = async () => {
    const rooms = (await fetchGetChatRooms()).data
    if (rooms.length === 0) {
      return await addNewChatRoom()
    }

    chatRooms.value = []
    chat.value = []

    rooms.forEach((r: Chat.ChatRoom) => {
      chatRooms.value.unshift(r)
      chat.value.unshift({ roomId: r.roomId, data: [] })
    })
    if (!rooms.find((item: Chat.ChatRoom) => item.roomId === active.value)) {
      active.value = chatRooms.value[0].roomId
      await reloadRoute(active.value!)
    }
  }

  const syncChat = async (room: Chat.ChatRoom, lastId?: number, callback?: () => void, onStart?: () => void, onEmpty?: () => void) => {
    if (!room.roomId)
      return callback?.()

    const roomIndex = findRoomIndex(room.roomId)
    if (roomIndex === -1 || chatRooms.value[roomIndex].loading || chatRooms.value[roomIndex].all) {
      if (lastId === undefined)
        callback?.()
      if (chatRooms.value[roomIndex]?.all)
        onEmpty?.()
      return
    }

    try {
      chatRooms.value[roomIndex].loading = true
      const chatIndex = findChatIndex(room.roomId)

      if (chatIndex === -1 || chat.value[chatIndex].data.length === 0 || lastId !== undefined) {
        onStart?.()
        const chatData = (await fetchGetChatHistory(room.roomId, lastId)).data

        if (chatData.length === 0) {
          chatRooms.value[roomIndex].all = true
        }
        else {
          if (chatIndex === -1) {
            chat.value.unshift({ roomId: room.roomId, data: chatData })
          }
          else {
            chat.value[chatIndex].data.unshift(...chatData)
          }
        }
      }
    }
    finally {
      chatRooms.value[roomIndex].loading = false
      if (chatRooms.value[roomIndex].all)
        onEmpty?.()
      recordState()
      callback?.()
    }
  }

  const setUsingContext = async (context: boolean, roomId: number) => {
    await fetchUpdateChatRoomUsingContext(context, roomId)
    recordState()
  }

  const setChatModel = async (chatModel: string, roomId: number) => {
    const index = findRoomIndex(active.value!)
    if (index !== -1) {
      chatRooms.value[index].chatModel = chatModel
      await fetchUpdateChatRoomChatModel(chatModel, roomId)
      const userStore = useUserStore()
      userStore.userInfo.config.chatModel = chatModel
      await fetchUpdateUserChatModel(chatModel)
    }
  }

  const setChatSearchEnabled = async (searchEnabled: boolean, roomId: number) => {
    const index = findRoomIndex(active.value!)
    if (index !== -1) {
      chatRooms.value[index].searchEnabled = searchEnabled
      await fetchUpdateChatRoomSearchEnabled(searchEnabled, roomId)
      recordState()
    }
  }

  const setChatThinkEnabled = async (thinkEnabled: boolean, roomId: number) => {
    const index = findRoomIndex(active.value!)
    if (index !== -1) {
      chatRooms.value[index].thinkEnabled = thinkEnabled
      await fetchUpdateChatRoomThinkEnabled(thinkEnabled, roomId)
      recordState()
    }
  }

  const updateChatRoom = async (uuid: number, edit: Partial<Chat.ChatRoom>) => {
    const index = findRoomIndex(uuid)
    if (index === -1)
      return

    chatRooms.value[index] = { ...chatRooms.value[index], ...edit }
    recordState()

    if (!edit.isEdit)
      await fetchRenameChatRoom(chatRooms.value[index].title, uuid)
  }

  const deleteChatRoom = async (index: number) => {
    await fetchDeleteChatRoom(chatRooms.value[index].roomId)
    chatRooms.value.splice(index, 1)
    chat.value.splice(index, 1)

    if (chatRooms.value.length === 0)
      return await addNewChatRoom()

    const nextIndex = Math.min(index, chatRooms.value.length - 1)
    const roomId = chatRooms.value[nextIndex].roomId
    active.value = roomId
    await reloadRoute(roomId)
  }

  const setActive = async (roomId: number) => {
    active.value = roomId
    return await reloadRoute(roomId)
  }

  const getChatByUuidAndIndex = (uuid: number, index: number) => {
    const targetUuid = getCurrentUuid(uuid)
    const chatIndex = findChatIndex(targetUuid)
    return chatIndex !== -1 ? chat.value[chatIndex].data[index] : null
  }

  const addChatByUuid = async (uuid: number, chatItem: Chat.Chat) => {
    const targetUuid = getCurrentUuid(uuid)
    let chatIndex = findChatIndex(targetUuid)

    if (chatIndex === -1 && chatRooms.value.length === 0) {
      const newUuid = Date.now()
      await fetchCreateChatRoom(chatItem.text, newUuid)
      chatRooms.value.push({ roomId: newUuid, title: chatItem.text, isEdit: false, usingContext: true, maxContextCount: 10 })
      chat.value.push({ roomId: newUuid, data: [chatItem] })
      active.value = newUuid
    }
    else {
      if (chatIndex === -1)
        chatIndex = 0
      chat.value[chatIndex].data.push(chatItem)

      if (chatRooms.value[chatIndex]?.title === 'New Chat') {
        chatRooms.value[chatIndex].title = chatItem.text
        await fetchRenameChatRoom(chatItem.text, chatRooms.value[chatIndex].roomId)
      }
    }
    recordState()
  }

  const updateChatByUuid = (uuid: number, index: number, chatItem: Chat.Chat | Partial<Chat.Chat>) => {
    const targetUuid = getCurrentUuid(uuid)
    const chatIndex = findChatIndex(targetUuid)

    if (chatIndex !== -1 && chat.value[chatIndex].data[index]) {
      const existingUuid = chat.value[chatIndex].data[index].uuid
      chat.value[chatIndex].data[index] = { ...chat.value[chatIndex].data[index], ...chatItem, uuid: existingUuid }
      recordState()
    }
  }

  const deleteChatByUuid = async (uuid: number, index: number) => {
    const targetUuid = getCurrentUuid(uuid)
    const chatIndex = findChatIndex(targetUuid)

    if (chatIndex !== -1 && chat.value[chatIndex].data[index]) {
      const chatData = chat.value[chatIndex].data[index]
      await fetchDeleteChat(targetUuid, chatData.uuid || 0, chatData.inversion)
      chat.value[chatIndex].data.splice(index, 1)
      recordState()
    }
  }

  const clearChatByUuid = async (uuid: number) => {
    const targetUuid = getCurrentUuid(uuid)
    const chatIndex = findChatIndex(targetUuid)

    if (chatIndex !== -1) {
      await fetchClearChat(targetUuid)
      chat.value[chatIndex].data = []
      recordState()
    }
  }

  const clearLocalChat = async () => {
    chat.value = []
    chatRooms.value = []
    active.value = null
    recordState()
    await router.push({ name: 'Chat' })
  }

  return {
    // State
    chat,
    chatRooms,
    active,

    // Getters
    getChatRoomByCurrentActive,
    getChatByUuid,

    // Actions
    syncHistory,
    syncChat,
    setUsingContext,
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
