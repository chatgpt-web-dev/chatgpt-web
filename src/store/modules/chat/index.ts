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

export const useChatStore = defineStore('chat-store', {
  state: (): Chat.ChatState => getLocalState(),

  getters: {
    getChatRoomByCurrentActive(state: Chat.ChatState) {
      const index = state.chatRooms.findIndex(item => item.uuid === state.active)
      if (index !== -1)
        return state.chatRooms[index]
      return null
    },

    getChatByUuid(state: Chat.ChatState) {
      return (uuid?: number) => {
        if (uuid)
          return state.chat.find(item => item.uuid === uuid)?.data ?? []
        return state.chat.find(item => item.uuid === state.active)?.data ?? []
      }
    },
  },

  actions: {
    async syncHistory(callback: () => void) {
      const rooms = (await fetchGetChatRooms()).data
      let uuid = this.active
      this.chatRooms = []
      this.chat = []
      if (rooms.findIndex((item: { uuid: number | null }) => item.uuid === uuid) <= -1)
        uuid = null

      for (const r of rooms) {
        this.chatRooms.unshift(r)
        if (uuid == null)
          uuid = r.uuid
        this.chat.unshift({ uuid: r.uuid, data: [] })
      }
      if (uuid == null) {
        await this.addNewChatRoom()
      }
      else {
        this.active = uuid
        this.reloadRoute(uuid)
      }
      callback && callback()
    },

    async syncChat(h: Chat.ChatRoom, lastId?: number, callback?: () => void, callbackForStartRequest?: () => void, callbackForEmptyMessage?: () => void) {
      if (!h.uuid) {
        callback && callback()
        return
      }
      const hisroty = this.chatRooms.filter(item => item.uuid === h.uuid)[0]
      if (hisroty === undefined || hisroty.loading || hisroty.all) {
        if (lastId === undefined) {
          // 加载更多不回调 避免加载概率消失
          callback && callback()
        }
        if (hisroty?.all ?? false)
          callbackForEmptyMessage && callbackForEmptyMessage()
        return
      }
      try {
        hisroty.loading = true
        const chatIndex = this.chat.findIndex(item => item.uuid === h.uuid)
        if (chatIndex <= -1 || this.chat[chatIndex].data.length <= 0 || lastId !== undefined) {
          callbackForStartRequest && callbackForStartRequest()
          const chatData = (await fetchGetChatHistory(h.uuid, lastId)).data
          if (chatData.length <= 0)
            hisroty.all = true

          if (chatIndex <= -1)
            this.chat.unshift({ uuid: h.uuid, data: chatData })
          else
            this.chat[chatIndex].data.unshift(...chatData)
        }
      }
      finally {
        hisroty.loading = false
        if (hisroty.all)
          callbackForEmptyMessage && callbackForEmptyMessage()
        this.recordState()
        callback && callback()
      }
    },

    async setUsingContext(context: boolean, roomId: number) {
      await fetchUpdateChatRoomUsingContext(context, roomId)
      this.recordState()
    },

    async setChatModel(chatModel: string, roomId: number) {
      const index = this.chatRooms.findIndex(item => item.uuid === this.active)
      this.chatRooms[index].chatModel = chatModel
      await fetchUpdateChatRoomChatModel(chatModel, roomId)
      const userStore = useUserStore()
      userStore.userInfo.config.chatModel = chatModel
      await fetchUpdateUserChatModel(chatModel)
    },

    async setChatSearchEnabled(searchEnabled: boolean, roomId: number) {
      const index = this.chatRooms.findIndex(item => item.uuid === this.active)
      if (index !== -1) {
        this.chatRooms[index].searchEnabled = searchEnabled
        await fetchUpdateChatRoomSearchEnabled(searchEnabled, roomId)
        this.recordState()
      }
    },

    async setChatThinkEnabled(thinkEnabled: boolean, roomId: number) {
      const index = this.chatRooms.findIndex(item => item.uuid === this.active)
      if (index !== -1) {
        this.chatRooms[index].thinkEnabled = thinkEnabled
        await fetchUpdateChatRoomThinkEnabled(thinkEnabled, roomId)
        this.recordState()
      }
    },

    async addNewChatRoom() {
      const title = 'New Chat'
      const roomId = Date.now()
      const result = await fetchCreateChatRoom(title, roomId)
      const chatRoom: Chat.ChatRoom = {
        title,
        uuid: roomId,
        isEdit: false,
        chatModel: result.data?.chatModel,
        usingContext: result.data?.usingContext,
        maxContextCount: result.data?.maxContextCount,
        searchEnabled: result.data?.searchEnabled,
        thinkEnabled: result.data?.thinkEnabled,
      }

      this.chatRooms.unshift(chatRoom)
      this.chat.unshift({ uuid: roomId, data: [] })
      this.active = roomId
      await this.reloadRoute(roomId)
    },

    async updateChatRoom(uuid: number, edit: Partial<Chat.ChatRoom>) {
      const index = this.chatRooms.findIndex(item => item.uuid === uuid)
      if (index !== -1) {
        this.chatRooms[index] = { ...this.chatRooms[index], ...edit }
        this.recordState()
        if (!edit.isEdit)
          await fetchRenameChatRoom(this.chatRooms[index].title, this.chatRooms[index].uuid)
      }
    },

    async deleteChatRoom(index: number) {
      await fetchDeleteChatRoom(this.chatRooms[index].uuid)
      this.chatRooms.splice(index, 1)
      this.chat.splice(index, 1)

      if (this.chatRooms.length === 0) {
        await this.addNewChatRoom()
        return
      }

      if (index > 0 && index <= this.chatRooms.length) {
        const uuid = this.chatRooms[index - 1].uuid
        this.active = uuid
        this.reloadRoute(uuid)
        return
      }

      if (index === 0) {
        if (this.chatRooms.length > 0) {
          const uuid = this.chatRooms[0].uuid
          this.active = uuid
          this.reloadRoute(uuid)
        }
      }

      if (index > this.chatRooms.length) {
        const uuid = this.chatRooms[this.chatRooms.length - 1].uuid
        this.active = uuid
        this.reloadRoute(uuid)
      }
    },

    async setActive(uuid: number) {
      this.active = uuid
      return await this.reloadRoute(uuid)
    },

    getChatByUuidAndIndex(uuid: number, index: number) {
      if (!uuid || uuid === 0) {
        if (this.chat.length)
          return this.chat[0].data[index]
        return null
      }
      const chatIndex = this.chat.findIndex(item => item.uuid === uuid)
      if (chatIndex !== -1)
        return this.chat[chatIndex].data[index]
      return null
    },

    async addChatByUuid(uuid: number, chat: Chat.Chat) {
      if (!uuid || uuid === 0) {
        if (this.chatRooms.length === 0) {
          const uuid = Date.now()
          await fetchCreateChatRoom(chat.text, uuid)
          this.chatRooms.push({ uuid, title: chat.text, isEdit: false, usingContext: true, maxContextCount: 10 })
          this.chat.push({ uuid, data: [chat] })
          this.active = uuid
          this.recordState()
        }
        else {
          this.chat[0].data.push(chat)
          if (this.chatRooms[0].title === 'New Chat') {
            this.chatRooms[0].title = chat.text
            await fetchRenameChatRoom(chat.text, this.chatRooms[0].uuid)
          }
          this.recordState()
        }
      }

      const index = this.chat.findIndex(item => item.uuid === uuid)
      if (index !== -1) {
        this.chat[index].data.push(chat)
        if (this.chatRooms[index].title === 'New Chat') {
          this.chatRooms[index].title = chat.text
          await fetchRenameChatRoom(chat.text, this.chatRooms[index].uuid)
        }
        this.recordState()
      }
    },

    updateChatByUuid(uuid: number, index: number, chat: Chat.Chat) {
      if (!uuid || uuid === 0) {
        if (this.chat.length) {
          chat.uuid = this.chat[0].data[index].uuid
          this.chat[0].data[index] = chat
          this.recordState()
        }
        return
      }

      const chatIndex = this.chat.findIndex(item => item.uuid === uuid)
      if (chatIndex !== -1) {
        chat.uuid = this.chat[chatIndex].data[index].uuid
        this.chat[chatIndex].data[index] = chat
        this.recordState()
      }
    },

    updateChatSomeByUuid(uuid: number, index: number, chat: Partial<Chat.Chat>) {
      if (!uuid || uuid === 0) {
        if (this.chat.length) {
          chat.uuid = this.chat[0].data[index].uuid
          this.chat[0].data[index] = { ...this.chat[0].data[index], ...chat }
          this.recordState()
        }
        return
      }

      const chatIndex = this.chat.findIndex(item => item.uuid === uuid)
      if (chatIndex !== -1) {
        chat.uuid = this.chat[chatIndex].data[index].uuid
        this.chat[chatIndex].data[index] = { ...this.chat[chatIndex].data[index], ...chat }
        this.recordState()
      }
    },

    async deleteChatByUuid(uuid: number, index: number) {
      if (!uuid || uuid === 0) {
        if (this.chat.length) {
          await fetchDeleteChat(uuid, this.chat[0].data[index].uuid || 0, this.chat[0].data[index].inversion)
          this.chat[0].data.splice(index, 1)
          this.recordState()
        }
        return
      }

      const chatIndex = this.chat.findIndex(item => item.uuid === uuid)
      if (chatIndex !== -1) {
        await fetchDeleteChat(uuid, this.chat[chatIndex].data[index].uuid || 0, this.chat[chatIndex].data[index].inversion)
        this.chat[chatIndex].data.splice(index, 1)
        this.recordState()
      }
    },

    async clearChatByUuid(uuid: number) {
      if (!uuid || uuid === 0) {
        if (this.chat.length) {
          await fetchClearChat(this.chat[0].uuid)
          this.chat[0].data = []
          this.recordState()
        }
        return
      }

      const index = this.chat.findIndex(item => item.uuid === uuid)
      if (index !== -1) {
        await fetchClearChat(uuid)
        this.chat[index].data = []
        this.recordState()
      }
    },

    async clearLocalChat() {
      this.chat = []
      this.chatRooms = []
      this.active = null
      this.recordState()
      await router.push({ name: 'Chat' })
    },

    async reloadRoute(uuid?: number) {
      this.recordState()
      await router.push({ name: 'Chat', params: { uuid } })
    },

    recordState() {
      setLocalState(this.$state)
    },
  },
})
