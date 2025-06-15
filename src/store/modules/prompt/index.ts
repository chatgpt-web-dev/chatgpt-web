import type { UserPrompt } from '@/components/common/Setting/model'

class PromptState {
  promptList: UserPrompt[] = []
}

export const usePromptStore = defineStore('prompt-store', () => {
  const state = reactive(new PromptState())

  const updatePromptList = (promptList: []) => {
    state.promptList = promptList
  }

  const getPromptList = () => {
    return state.promptList
  }

  return {
    ...toRefs(state),

    updatePromptList,
    getPromptList,
  }
})
