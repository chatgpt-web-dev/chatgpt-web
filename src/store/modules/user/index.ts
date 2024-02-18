import { defineStore } from 'pinia'
import { fetchResetAdvanced, fetchUpdateAdvanced, fetchUpdateUserAmt, fetchUpdateUserInfo, fetchUserAmt } from '../../../api/'
import type { UserInfo, UserState } from './helper'
import { defaultSetting, getLocalState, setLocalState } from './helper'

export const useUserStore = defineStore('user-store', {
  state: (): UserState => getLocalState(),
  actions: {
    async updateUserInfo(update: boolean, userInfo: Partial<UserInfo>) {
      this.userInfo = { ...this.userInfo, ...userInfo }
      this.recordState()
      if (update)
        await fetchUpdateUserInfo(userInfo.name ?? '', userInfo.avatar ?? '', userInfo.description ?? '')
        // 更新用户信息和额度写一起了，如果传了额度则更新
        if (userInfo.useAmount)
          await fetchUpdateUserAmt(userInfo.useAmount)
    },
    async updateSetting(sync: boolean) {
      await fetchUpdateAdvanced(sync, this.userInfo.advanced)
      this.recordState()
    },
    // 对应页面加载时的读取，为空送10个
    async readUserAmt() {
      this.userInfo.useAmount = (await (fetchUserAmt())).data ?? 10
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
