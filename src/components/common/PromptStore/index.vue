<script setup lang='ts'>
import type { DataTableColumns } from 'naive-ui'
import { computed, h, onMounted, reactive, ref, watch } from 'vue'
import { NButton, NCard, NDataTable, NDivider, NInput, NList, NListItem, NModal, NPopconfirm, NSpace, NTabPane, NTabs, NThing, useMessage } from 'naive-ui'
import PromptRecommend from '../../../assets/recommend.json'
import { SvgIcon } from '..'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { UserPrompt } from '@/components/common/Setting/model'
import { fetchDeleteUserPrompt, fetchUpsertUserPrompt, fetchUserPromptList } from '@/api'

interface DataProps {
  _id?: string
  renderKey: string
  renderValue: string
  title: string
  value: string
}

interface Props {
  visible: boolean
}

interface Emit {
  (e: 'update:visible', visible: boolean): void
}

const props = defineProps<Props>()

const emit = defineEmits<Emit>()

const message = useMessage()

const show = computed({
  get: () => props.visible,
  set: (visible: boolean) => emit('update:visible', visible),
})
const loading = ref(false)
const showModal = ref(false)

const importLoading = ref(false)
const exportLoading = ref(false)

const searchValue = ref<string>('')

// 移动端自适应相关
const { isMobile } = useBasicLayout()

// Prompt在线导入推荐List,根据部署者喜好进行修改(assets/recommend.json)
const promptRecommendList = PromptRecommend
const promptList = ref<UserPrompt[]>([])

// 用于添加修改的临时prompt参数
const tempPromptKey = ref('')
const tempPromptValue = ref('')

// Modal模式，根据不同模式渲染不同的Modal内容
const modalMode = ref('')

// 这个是为了后期的修改Prompt内容考虑，因为要针对无uuid的list进行修改，且考虑到不能出现标题和内容的冲突，所以就需要一个临时item来记录一下
const tempModifiedItem = ref<any>({})

// 添加修改导入都使用一个Modal, 临时修改内容占用tempPromptKey,切换状态前先将内容都清楚
const changeShowModal = (mode: 'add' | 'modify' | 'local_import', selected?: DataProps) => {
  if (mode === 'add') {
    tempPromptKey.value = ''
    tempPromptValue.value = ''
  }
  else if (mode === 'modify' && selected !== undefined) {
    tempModifiedItem.value = { ...selected }
    tempPromptKey.value = selected.title
    tempPromptValue.value = selected.value
  }
  else if (mode === 'local_import') {
    tempPromptKey.value = 'local_import'
    tempPromptValue.value = ''
  }
  showModal.value = !showModal.value
  modalMode.value = mode
}

// 在线导入相关
const downloadURL = ref('')
const downloadDisabled = computed(() => downloadURL.value.trim().length < 1)
const setDownloadURL = (url: string) => {
  downloadURL.value = url
}

// 控制 input 按钮
const inputStatus = computed (() => tempPromptKey.value.trim().length < 1 || tempPromptValue.value.trim().length < 1)

// Prompt模板相关操作
async function addPromptTemplate() {
  for (const i of promptList.value) {
    if (i.title === tempPromptKey.value) {
      message.error(t('store.addRepeatTitleTips'))
      return
    }
    if (i.value === tempPromptValue.value) {
      message.error(t('store.addRepeatContentTips', { msg: tempPromptKey.value }))
      return
    }
  }
  const userPrompt = new UserPrompt(tempPromptKey.value, tempPromptValue.value)
  await fetchUpsertUserPrompt(userPrompt)
  promptList.value.unshift({ title: tempPromptKey.value, value: tempPromptValue.value } as never)
  message.success(t('common.addSuccess'))
  changeShowModal('add')
}

const modifyPromptTemplate = async () => {
  let index = 0

  // 通过临时索引把待修改项摘出来
  for (const i of promptList.value) {
    if (i.title === tempModifiedItem.value.title && i.value === tempModifiedItem.value.value)
      break
    index = index + 1
  }

  const tempList = promptList.value.filter((_: any, i: number) => i !== index)

  // 搜索有冲突的部分
  for (const i of tempList) {
    if (i.title === tempPromptKey.value) {
      message.error(t('store.editRepeatTitleTips'))
      return
    }
    if (i.value === tempPromptValue.value) {
      message.error(t('store.editRepeatContentTips', { msg: i.title }))
      return
    }
  }
  const userPrompt = new UserPrompt(tempPromptKey.value, tempPromptValue.value)
  userPrompt._id = tempModifiedItem.value._id
  await fetchUpsertUserPrompt(userPrompt)
  promptList.value = [{ title: tempPromptKey.value, value: tempPromptValue.value }, ...tempList] as never
  message.success(t('common.editSuccess'))
  changeShowModal('modify')
}

async function deletePromptTemplate(row: DataProps) {
  if (row._id === undefined)
    return

  loading.value = true
  await fetchDeleteUserPrompt(row._id)
  loading.value = false
  promptList.value = [
    ...promptList.value.filter((item: UserPrompt) => item._id !== row._id),
  ] as never
  message.success(t('common.deleteSuccess'))
}

const clearPromptTemplate = () => {
  promptList.value = []
  message.success(t('common.clearSuccess'))
}

const importPromptTemplate = (from = 'online') => {
  try {
    const jsonData = JSON.parse(tempPromptValue.value)
    let key = ''
    let value = ''
    // 可以扩展加入更多模板字典的key
    if ('key' in jsonData[0]) {
      key = 'key'
      value = 'value'
    }
    else if ('act' in jsonData[0]) {
      key = 'act'
      value = 'prompt'
    }
    else {
      // 不支持的字典的key防止导入 以免破坏prompt商店打开
      message.warning('prompt key not supported.')
      throw new Error('prompt key not supported.')
    }

    for (const i of jsonData) {
      if (!(key in i) || !(value in i))
        throw new Error(t('store.importError'))
      let safe = true
      for (const j of promptList.value) {
        if (j.title === i[key]) {
          message.warning(t('store.importRepeatTitle', { msg: i[key] }))
          safe = false
          break
        }
        if (j.value === i[value]) {
          message.warning(t('store.importRepeatContent', { msg: i[key] }))
          safe = false
          break
        }
      }
      if (safe)
        promptList.value.unshift({ key: i[key], value: i[value] } as never)
    }
    message.success(t('common.importSuccess'))
  }
  catch {
    message.error('JSON 格式错误，请检查 JSON 格式')
  }
  if (from === 'local')
    showModal.value = !showModal.value
}

// 模板导出
const exportPromptTemplate = () => {
  exportLoading.value = true
  const jsonDataStr = JSON.stringify(promptList.value)
  const blob = new Blob([jsonDataStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'ChatGPTPromptTemplate.json'
  link.click()
  URL.revokeObjectURL(url)
  exportLoading.value = false
}

// 模板在线导入
const downloadPromptTemplate = async () => {
  try {
    importLoading.value = true
    const response = await fetch(downloadURL.value)
    const jsonData = await response.json()
    if ('key' in jsonData[0] && 'value' in jsonData[0])
      tempPromptValue.value = JSON.stringify(jsonData)
    if ('act' in jsonData[0] && 'prompt' in jsonData[0]) {
      const newJsonData = jsonData.map((item: { act: string; prompt: string }) => {
        return {
          key: item.act,
          value: item.prompt,
        }
      })
      tempPromptValue.value = JSON.stringify(newJsonData)
    }
    importPromptTemplate()
    downloadURL.value = ''
  }
  catch {
    message.error(t('store.downloadError'))
    downloadURL.value = ''
  }
  finally {
    importLoading.value = false
  }
}

// 移动端自适应相关
const renderTemplate = () => {
  const [keyLimit, valueLimit] = isMobile.value ? [10, 30] : [15, 50]
  return promptList.value.map((item: UserPrompt) => {
    return {
      renderKey: item.title.length <= keyLimit ? item.title : `${item.title.substring(0, keyLimit)}...`,
      renderValue: item.value.length <= valueLimit ? item.value : `${item.value.substring(0, valueLimit)}...`,
      title: item.title,
      value: item.value,
      _id: item._id,
    }
  })
}

// const pagination = computed(() => {
//   const [pageSize, pageSlot] = isMobile.value ? [6, 5] : [7, 15]
//   return {
//     pageSize, pageSlot,
//   }
// })

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
    handleGetUserPromptList(pagination.page)
  },
  onUpdatePageSize: (pageSize: number) => {
    pagination.pageSize = pageSize
    pagination.page = 1
    handleGetUserPromptList(pagination.page)
  },
})

// table相关
const createColumns = (): DataTableColumns<DataProps> => {
  return [
    {
      title: t('store.title'),
      key: 'renderKey',
    },
    {
      title: t('store.description'),
      key: 'renderValue',
    },
    {
      title: t('common.action'),
      key: 'actions',
      width: 100,
      align: 'center',
      render(row) {
        return h('div', { class: 'flex items-center flex-col gap-2' }, {
          default: () => [h(
            NButton,
            {
              tertiary: true,
              size: 'small',
              type: 'info',
              onClick: () => changeShowModal('modify', row),
            },
            { default: () => t('common.edit') },
          ),
          h(
            NButton,
            {
              tertiary: true,
              size: 'small',
              type: 'error',
              onClick: () => deletePromptTemplate(row),
            },
            { default: () => t('common.delete') },
          ),
          ],
        })
      },
    },
  ]
}

const columns = createColumns()

watch(
  () => promptList,
  () => {
  },
  { deep: true },
)

async function handleGetUserPromptList(page: number) {
  if (loading.value)
    return
  promptList.value.length = 0
  loading.value = true
  const size = pagination.pageSize
  const data = (await fetchUserPromptList(page, size)).data
  data.data.forEach((d: UserPrompt) => {
    promptList.value.push(d)
  })
  pagination.page = page
  pagination.pageCount = data.total / size + (data.total % size === 0 ? 0 : 1)
  pagination.itemCount = data.total
  loading.value = false
}

onMounted(async () => {
  await handleGetUserPromptList(pagination.page)
})

const dataSource = computed(() => {
  const data = renderTemplate()
  const value = searchValue.value
  if (value && value !== '') {
    return data.filter((item: DataProps) => {
      return item.renderKey.includes(value) || item.renderValue.includes(value)
    })
  }
  return data
})
</script>

<template>
  <NModal v-model:show="show" style="width: 90%; max-width: 900px;" preset="card">
    <div class="space-y-4">
      <NTabs type="segment">
        <NTabPane name="local" :tab="$t('store.local')">
          <div
            class="flex gap-3 mb-4"
            :class="[isMobile ? 'flex-col' : 'flex-row justify-between']"
          >
            <div class="flex items-center space-x-4">
              <NButton
                type="primary"
                size="small"
                @click="changeShowModal('add')"
              >
                {{ $t('common.add') }}
              </NButton>
              <NButton
                size="small"
                @click="changeShowModal('local_import')"
              >
                {{ $t('common.import') }}
              </NButton>
              <NButton
                size="small"
                :loading="exportLoading"
                @click="exportPromptTemplate()"
              >
                {{ $t('common.export') }}
              </NButton>
              <NPopconfirm @positive-click="clearPromptTemplate">
                <template #trigger>
                  <NButton size="small">
                    {{ $t('common.clear') }}
                  </NButton>
                </template>
                {{ $t('store.clearStoreConfirm') }}
              </NPopconfirm>
            </div>
            <div class="flex items-center">
              <NInput v-model:value="searchValue" style="width: 100%" />
            </div>
          </div>
          <NDataTable
            v-if="!isMobile"
            :max-height="400"
            :columns="columns"
            :data="dataSource"
            :pagination="pagination"
            :bordered="false"
            :loading="loading"
          />
          <NList v-if="isMobile" style="max-height: 400px; overflow-y: auto;">
            <NListItem v-for="(item, index) of dataSource" :key="index">
              <NThing :title="item.renderKey" :description="item.renderValue" />
              <template #suffix>
                <div class="flex flex-col items-center gap-2">
                  <NButton tertiary size="small" type="info" @click="changeShowModal('modify', item)">
                    {{ t('common.edit') }}
                  </NButton>
                  <NButton tertiary size="small" type="error" @click="deletePromptTemplate(item)">
                    {{ t('common.delete') }}
                  </NButton>
                </div>
              </template>
            </NListItem>
          </NList>
        </NTabPane>
        <NTabPane name="download" :tab="$t('store.online')">
          <p class="mb-4">
            {{ $t('store.onlineImportWarning') }}
          </p>
          <div class="flex items-center gap-4">
            <NInput v-model:value="downloadURL" placeholder="" />
            <NButton
              strong
              secondary
              :disabled="downloadDisabled"
              :loading="importLoading"
              @click="downloadPromptTemplate()"
            >
              {{ $t('common.download') }}
            </NButton>
          </div>
          <NDivider />
          <div class="max-h-[360px] overflow-y-auto space-y-4">
            <NCard
              v-for="info in promptRecommendList"
              :key="info.title" :title="info.title"
              :bordered="true"
              embedded
            >
              <p
                class="overflow-hidden text-ellipsis whitespace-nowrap"
                :title="info.desc"
              >
                {{ info.desc }}
              </p>
              <template #footer>
                <div class="flex items-center justify-end space-x-4">
                  <NButton text>
                    <a
                      :href="info.url"
                      target="_blank"
                    >
                      <SvgIcon class="text-xl" icon="ri:link" />
                    </a>
                  </NButton>
                  <NButton text @click="setDownloadURL(info.downloadUrl) ">
                    <SvgIcon class="text-xl" icon="ri:add-fill" />
                  </NButton>
                </div>
              </template>
            </NCard>
          </div>
        </NTabPane>
      </NTabs>
    </div>
  </NModal>

  <NModal v-model:show="showModal" style="width: 90%; max-width: 600px;" preset="card">
    <NSpace v-if="modalMode === 'add' || modalMode === 'modify'" vertical>
      {{ t('store.title') }}
      <NInput v-model:value="tempPromptKey" />
      {{ t('store.description') }}
      <NInput v-model:value="tempPromptValue" type="textarea" />
      <NButton
        block
        type="primary"
        :disabled="inputStatus"
        @click="() => { modalMode === 'add' ? addPromptTemplate() : modifyPromptTemplate() }"
      >
        {{ t('common.confirm') }}
      </NButton>
    </NSpace>
    <NSpace v-if="modalMode === 'local_import'" vertical>
      <NInput
        v-model:value="tempPromptValue"
        :placeholder="t('store.importPlaceholder')"
        :autosize="{ minRows: 3, maxRows: 15 }"
        type="textarea"
      />
      <NButton
        block
        type="primary"
        :disabled="inputStatus"
        @click="() => { importPromptTemplate('local') }"
      >
        {{ t('common.import') }}
      </NButton>
    </NSpace>
  </NModal>
</template>
