import type { Router } from 'vue-router'
import { useUserStore } from '@/store'
import { useAuthStoreWithout } from '@/store/modules/auth'

export function setupPageGuard(router: Router) {
  router.beforeEach(async (to, from, next) => {
    const authStore = useAuthStoreWithout()
    if (!authStore.session) {
      try {
        const data = await authStore.getSession()
        document.title = data.title
        if (String(data.auth) === 'false' && authStore.token)
          await authStore.removeToken()
        else
          await useUserStore().updateUserInfo(false, data.userInfo)

        if (to.path === '/500')
          next({ name: 'Root' })
        else
          next()
      }
      catch {
        if (to.path !== '/500')
          next({ name: '500' })
        else
          next()
      }
    }
    else {
      next()
    }
  })
}
