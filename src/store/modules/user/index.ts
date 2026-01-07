import type { UserInfo, UserState } from './helper'
import { fetchResetAdvanced, fetchUpdateAdvanced, fetchUpdateUserAmt, fetchUpdateUserInfo, fetchUserAmt } from '@/api'
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
    async updateSetting(sync: boolean) {
      await fetchUpdateAdvanced(sync, this.userInfo.advanced)
      this.recordState()
    },
    // Read on page load; default to 10 when empty.
    async readUserAmt() {
      const data = (await fetchUserAmt()).data
      this.userInfo.limit = data?.limit
      this.userInfo.useAmount = data?.amount ?? 10
    },

    async resetSetting() {
      await fetchResetAdvanced()
      this.userInfo.advanced = { ...defaultSetting().userInfo.advanced }
      this.recordState()
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
