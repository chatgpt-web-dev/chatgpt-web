import { defineStore } from 'pinia'
import type { UserInfo, UserState } from './helper'
import { defaultSetting, getLocalState, setLocalState } from './helper'
import { fetchResetAdvanced, fetchUpdateAdvanced, fetchUpdateUserAmt, fetchUpdateUserInfo, fetchUserAmt } from '@/api'

export const useUserStore = defineStore('user-store', {
  state: (): UserState => getLocalState(),
  actions: {
    async updateUserInfo(update: boolean, userInfo: Partial<UserInfo>) {
      this.userInfo = { ...this.userInfo, ...userInfo }
      this.recordState()
      if (update) {
        await fetchUpdateUserInfo(userInfo.name ?? '', userInfo.avatar ?? '', userInfo.description ?? '')
        // 更新用户信息和额度写一起了，如果传了额度则更新
        if (userInfo.useAmount)
          await fetchUpdateUserAmt(userInfo.useAmount)
      }
      if (update)
        await fetchUpdateUserInfo(userInfo.name ?? '', userInfo.avatar ?? '', userInfo.description ?? '', userInfo.temperature ?? 0.8, userInfo.top_p ?? 0.9, userInfo.presencePenalty ?? 0.6, userInfo.systemRole ?? '')
    },
    async updateSetting(sync: boolean) {
      await fetchUpdateAdvanced(sync, this.userInfo.advanced)
      this.recordState()
    },
    // 对应页面加载时的读取，为空送10个
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
