<script setup lang='ts'>
import { fetchRenameChatRoom } from '@/api'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAppStore, useChatStore } from '@/store'
import { useAuthStoreWithout } from '@/store/modules/auth'
import { debounce } from '@/utils/functions/debounce'

const { t } = useI18n()

const { isMobile } = useBasicLayout()

const appStore = useAppStore()
const chatStore = useChatStore()
const authStore = useAuthStoreWithout()

const loadingRoom = ref(false)

const dataSources = computed(() => chatStore.chatRooms)

onMounted(async () => {
  if (authStore.session == null || !authStore.session.auth || authStore.token || authStore.session?.authProxyEnabled)
    await handleSyncChatRoom()
})

async function handleSyncChatRoom() {
  loadingRoom.value = true
  await chatStore.syncHistory()
  loadingRoom.value = false
}

async function handleSelect({ roomId }: Chat.ChatRoom) {
  if (isActive(roomId))
    return

  await chatStore.setActive(roomId)

  if (isMobile.value)
    appStore.setSiderCollapsed(true)
}

async function handleEdit(chatRoom: Chat.ChatRoom, isEdit: boolean) {
  chatRoom.isEdit = isEdit
  if (!chatRoom.isEdit)
    await fetchRenameChatRoom(chatRoom.title, chatRoom.roomId)
}

function handleDelete(index: number, event?: MouseEvent | TouchEvent) {
  event?.stopPropagation()
  chatStore.deleteChatRoom(index)
  if (isMobile.value)
    appStore.setSiderCollapsed(true)
}

const handleDeleteDebounce = debounce(handleDelete, 600)

function isActive(uuid: number) {
  return chatStore.active === uuid
}
</script>

<template>
  <NScrollbar class="px-4">
    <NSpin :show="loadingRoom">
      <div class="flex flex-col gap-2 text-sm">
        <template v-if="!dataSources.length">
          <div class="flex flex-col items-center mt-4 text-center text-neutral-300">
            <IconRiInboxLine class="mb-2 text-3xl" />
            <span>{{ t('common.noData') }}</span>
          </div>
        </template>
        <template v-else>
          <div v-for="(item, index) of dataSources" :key="index">
            <a
              class="relative flex items-center gap-3 px-3 py-3 break-all border rounded-md cursor-pointer hover:bg-neutral-100 group dark:border-neutral-800 dark:hover:bg-[#24272e]"
              :class="isActive(item.roomId) && ['border-[#4b9e5f]', 'bg-neutral-100', 'text-[#4b9e5f]', 'dark:bg-[#24272e]', 'dark:border-[#4b9e5f]', 'pr-14']"
              @click="handleSelect(item)"
            >
              <span>
                <IconRiMessage3Line />
              </span>
              <div class="relative flex-1 overflow-hidden break-all text-ellipsis whitespace-nowrap">
                <NInput
                  v-if="item.isEdit"
                  v-model:value="item.title" size="tiny"
                  @keydown.enter.stop="handleEdit(item, false)"
                />
                <span v-else>{{ item.title }}</span>
              </div>
              <div v-if="isActive(item.roomId)" class="absolute z-10 flex visible right-1">
                <template v-if="item.isEdit">
                  <button class="p-1" @click="handleEdit(item, false)">
                    <IconRiSaveLine />
                  </button>
                </template>
                <template v-else>
                  <button class="p-1">
                    <IconRiEditLine @click.stop="handleEdit(item, true)" />
                  </button>
                  <NPopconfirm placement="bottom" @positive-click="handleDeleteDebounce(index, $event)">
                    <template #trigger>
                      <button class="p-1">
                        <IconRiDeleteBinLine />
                      </button>
                    </template>
                    {{ t('chat.deleteHistoryConfirm') }}
                  </NPopconfirm>
                </template>
              </div>
            </a>
          </div>
        </template>
      </div>
    </NSpin>
  </NScrollbar>
</template>
