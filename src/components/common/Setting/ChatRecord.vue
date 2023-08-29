<script setup lang="ts">
import { NButton, NDataTable, NModal, NScrollbar, NSelect, NSpace } from 'naive-ui'
import { h, onMounted, reactive, ref } from 'vue'
import Message from './Message/index.vue'
import { fetchGetChatHistory, fetchGetChatRoomsCount, fetchGetUsers } from '@/api'
import { useBasicLayout } from '@/hooks/useBasicLayout'

interface HistoryChat {
  uuid?: number
  dateTime: string
  text: string
  inversion?: boolean
  responseCount?: number
  error?: boolean
  loading?: boolean
  usage?: {
    completion_tokens: number
    prompt_tokens: number
    total_tokens: number
    estimated: boolean
  }
}

const show = ref(false)
const { isMobile } = useBasicLayout()
const dataSources = ref<HistoryChat[]>([])
const selectUserId = ref('')
const userOptions = ref([{ label: 'all', value: '' }])
const loading = ref(false)
const chatRooms = ref([])
const columns = [{
  title: 'Last Time',
  key: 'lastTime',
  width: 50,
},
{
  title: 'Title',
  key: 'title',
  width: 50,
  ellipsis: {
    tooltip: true,
  },
},
{
  title: 'Chat Count',
  key: 'chatCount',
  width: 50,
},
{
  title: 'Action',
  key: 'uuid',
  width: 50,
  render(row: any) {
    const actions: any[] = []
    actions.push(h(
      NButton,
      {
        size: 'small',
        type: 'primary',
        style: {
          marginRight: '6px',
        },
        onClick: () => {
          show.value = true
          dataSources.value.length = 0
          fetchGetChatHistory(row.uuid, undefined, 'all').then((res: any) => {
            dataSources.value = res.data as HistoryChat[]
          })
        },
      },
      { default: () => 'view' },
    ))
    return actions
  },
}]
const pagination = reactive ({
  page: 1,
  pageSize: 25,
  pageCount: 1,
  itemCount: 1,
  prefix({ itemCount }: { itemCount: number | undefined }) {
    return `Total is ${itemCount}.`
  },
  showSizePicker: true,
  pageSizes: [25, 50, 100],
  onChange: (page: number) => {
    pagination.page = page
    handleGetChatRoomsCount(pagination.page)
  },
  onUpdatePageSize: (pageSize: number) => {
    pagination.pageSize = pageSize
    pagination.page = 1
    handleGetChatRoomsCount(pagination.page)
  },
})

async function handleSelectUser() {
  await handleGetChatRoomsCount(pagination.page)
}

function handleGetUsers(page: number, size: number) {
  fetchGetUsers(page, size).then((res: any) => {
    res.data.users.forEach((d: any) => {
      userOptions.value.push({
        label: d.name,
        value: d._id,
      })
    })
  })
}

async function handleGetChatRoomsCount(page: number) {
  if (loading.value)
    return
  chatRooms.value.length = 0
  loading.value = true
  const size = pagination.pageSize
  const data = (await fetchGetChatRoomsCount(page, size, selectUserId.value)).data
  data.data.forEach((d: never) => {
    chatRooms.value.push(d)
  })
  pagination.page = page
  pagination.pageCount = data.total / size + (data.total % size === 0 ? 0 : 1)
  pagination.itemCount = data.total
  loading.value = false
}
onMounted(async () => {
  await handleGetChatRoomsCount(pagination.page)
  handleGetUsers(1, 100)
})
</script>

<template>
  <div class="p-4 space-y-5 min-h-[200px]">
    <div class="space-y-6">
      <NSelect
        v-model:value="selectUserId"
        style="width: 250px"
        :options="userOptions"
        @update:value="handleSelectUser"
      />
      <NSpace vertical :size="12">
        <NDataTable
          ref="table"
          remote
          :loading="loading"
          :row-key="(rowData) => rowData._id"
          :columns="columns"
          :data="chatRooms"
          :pagination="pagination"
          :max-height="444"
          striped
          @update:page="handleGetChatRoomsCount"
        />
      </NSpace>
    </div>
    <NModal v-model:show="show" preset="card" :style="{ width: !isMobile ? '80%' : '100%' }">
      <NScrollbar style="max-height: 80vh;padding: 0 15px;">
        <Message
          v-for="(item, index) of dataSources"
          :key="index"
          :date-time="item.dateTime"
          :text="item.text"
          :inversion="item.inversion"
          :response-count="item.responseCount"
          :usage="item && item.usage || undefined"
          :error="item.error"
          :loading="item.loading"
        />
      </NScrollbar>
    </NModal>
  </div>
</template>

<style scoped>

</style>
