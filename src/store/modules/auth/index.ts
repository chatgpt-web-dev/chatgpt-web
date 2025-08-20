import type { UserInfo } from '../user/helper'
import { jwtDecode } from 'jwt-decode'
import { fetchLogout, fetchSession } from '@/api'
import { UserConfig } from '@/components/common/Setting/model'
import { store } from '@/store/helper'
import { useChatStore } from '../chat'
import { useUserStore } from '../user'
import { getToken, removeToken, setToken } from './helper'

interface SessionResponse {
  auth: boolean
  authProxyEnabled: boolean
  allowRegister: boolean
  title: string
  chatModels: {
    label: string
    key: string
    value: string
  }[]
  allChatModels: {
    label: string
    key: string
    value: string
  }[]
  usageCountLimit: boolean
  showWatermark: boolean
  userInfo: { name: string, description: string, avatar: string, userId: string, root: boolean, config: UserConfig }
}

export interface AuthState {
  token: string | undefined
  session: SessionResponse | null
}

export const useAuthStore = defineStore('auth-store', {
  state: (): AuthState => ({
    token: getToken(),
    session: null,
  }),

  actions: {
    async getSession() {
      try {
        const { data } = await fetchSession<SessionResponse>()
        this.session = { ...data }
        return Promise.resolve(data)
      }
      catch (error) {
        return Promise.reject(error)
      }
    },

    async setToken(token: string) {
      this.token = token
      const decoded = jwtDecode(token) as UserInfo
      const userStore = useUserStore()
      if (decoded.config === undefined || decoded.config === null)
        decoded.config = new UserConfig()

        decoded.config.chatModel = 'zjai'
      }


      await userStore.updateUserInfo(false, {
        avatar: decoded.avatar,
        name: decoded.name,
        description: decoded.description,
        root: decoded.root,
        config: decoded.config,
      })
      setToken(token)
    },

    async removeToken() {
      this.token = undefined
      const userStore = useUserStore()
      userStore.resetUserInfo()
      const chatStore = useChatStore()
      await chatStore.clearLocalChat()
      removeToken()
      await fetchLogout()
    },
  },
})

export function useAuthStoreWithout() {
  return useAuthStore(store)
}
