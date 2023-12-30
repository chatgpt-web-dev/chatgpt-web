import { defineStore } from 'pinia'
import { fetchResetAdvanced, fetchUpdateAdvanced, fetchUpdateUserInfo } from '../../../api/'
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
    },
    async updateSetting(sync: boolean) {
      await fetchUpdateAdvanced(sync, this.userInfo.advanced)
      this.recordState()
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
