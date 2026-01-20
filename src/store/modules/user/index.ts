import type { UserInfo, UserState } from './helper'
import { fetchUpdateUserAmt, fetchUpdateUserInfo, fetchUserAmt } from '@/api'
import { defaultSetting, getLocalState, setLocalState } from './helper'

export const useUserStore = defineStore('user-store', {
  state: (): UserState => getLocalState(),
  actions: {
    async updateUserInfo(update: boolean, userInfo: Partial<UserInfo>) {
      this.userInfo = { ...this.userInfo, ...userInfo }
      this.recordState()
      if (update) {
        await fetchUpdateUserInfo(userInfo.name ?? '', userInfo.avatar ?? '', userInfo.description ?? '')
        // Update user info and usage together; update usage if provided.
        if (userInfo.useAmount)
          await fetchUpdateUserAmt(userInfo.useAmount)
      }
    },
    // Read on page load; default to 10 when empty.
    async readUserAmt() {
      const data = (await fetchUserAmt()).data
      this.userInfo.limit = data?.limit
      this.userInfo.useAmount = data?.amount ?? 10
    },

    resetUserInfo() {
      this.userInfo = { ...defaultSetting().userInfo }
      this.recordState()
    },

    recordState() {
      setLocalState(this.$state)
    },
  },
})
