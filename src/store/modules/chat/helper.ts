import { ss } from '@/utils/storage'

const LOCAL_NAME = 'chatStorage'

export function defaultState(): Chat.ChatState {
  const roomId = null
  return {
    active: roomId,
    usingContext: true,
    chatRooms: [{ roomId: 0, title: 'New Chat', isEdit: false, usingContext: true, maxContextCount: 10 }],
    chat: [{ roomId: 0, data: [] }],
  }
}

export function getLocalState(): Chat.ChatState {
  const localState = ss.get(LOCAL_NAME)
  return { ...defaultState(), ...localState }
}

export function setLocalState(state: Chat.ChatState) {
  ss.set(LOCAL_NAME, state)
}
