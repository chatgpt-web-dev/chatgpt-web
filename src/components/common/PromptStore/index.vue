<script setup lang='ts'>
import type { DataTableColumns } from 'naive-ui'
import { NButton } from 'naive-ui'
import { fetchClearUserPrompt, fetchDeleteUserPrompt, fetchImportUserPrompt, fetchUpsertUserPrompt, fetchUserPromptList } from '@/api'
import { UserPrompt } from '@/components/common/Setting/model'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAuthStoreWithout, usePromptStore } from '@/store'
import { SvgIcon } from '..'
import PromptRecommend from '../../../assets/recommend.json'

const props = defineProps<Props>()

const emit = defineEmits<Emit>()

const { t } = useI18n()

interface DataProps {
  _id?: string
  title: string
  value: string
  type: 'built-in' | 'user-defined'
}

interface Props {
  visible: boolean
}

interface Emit {
  (e: 'update:visible', visible: boolean): void
}

const message = useMessage()

const show = computed({
  get: () => props.visible,
  set: (visible: boolean) => emit('update:visible', visible),
})
const loading = ref(false)
const showModal = ref(false)
const saving = ref(false)

const importLoading = ref(false)
const exportLoading = ref(false)

const searchValue = ref<string>('')

const authStore = useAuthStoreWithout()

const promptStore = usePromptStore()

// Mobile responsiveness.
const { isMobile } = useBasicLayout()

// Recommended prompt list for online import; customize via assets/recommend.json.
const promptRecommendList = PromptRecommend
// const promptList = ref<UserPrompt[]>([])

const promptList = ref<any>(promptStore.promptList)

// Temporary prompt params for add/edit.
const tempPromptKey = ref('')
const tempPromptValue = ref('')

// Modal mode; render different content per mode.
const modalMode = ref('')

// Track a temporary item for editing lists without UUIDs and avoiding title/content conflicts.
const tempModifiedItem = ref<any>({})

// Add/edit/import share one modal; tempPromptKey holds edits and is cleared on mode switch.
function changeShowModal(mode: 'add' | 'modify' | 'local_import', selected?: DataProps) {
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

// Online import.
const downloadURL = ref('')
const downloadDisabled = computed(() => downloadURL.value.trim().length < 1)
function setDownloadURL(url: string) {
  downloadURL.value = url
}

// Control input button state.
const inputStatus = computed (() => tempPromptKey.value.trim().length < 1 || tempPromptValue.value.trim().length < 1)

// Prompt template operations.
async function addPromptTemplate() {
  if (saving.value)
    return
  saving.value = true
  for (const i of promptList.value) {
    if (i.title === tempPromptKey.value) {
      message.error(t('store.addRepeatTitleTips'))
      saving.value = false
      return
    }
    if (i.value === tempPromptValue.value) {
      message.error(t('store.addRepeatContentTips', { msg: tempPromptKey.value }))
      saving.value = false
      return
    }
  }
  try {
    const userPrompt = new UserPrompt(tempPromptKey.value, tempPromptValue.value)
    const data = (await fetchUpsertUserPrompt(userPrompt)).data
    promptList.value.unshift({ title: tempPromptKey.value, value: tempPromptValue.value, _id: data._id } as never)
    message.success(t('common.addSuccess'))
    changeShowModal('add')
  }
  finally {
    saving.value = false
  }
}

async function modifyPromptTemplate() {
  if (saving.value)
    return
  saving.value = true
  let index = 0

  // Extract the item to edit by temporary index.
  for (const i of promptList.value) {
    if (i.title === tempModifiedItem.value.title && i.value === tempModifiedItem.value.value)
      break
    index = index + 1
  }

  const tempList = promptList.value.filter((_: any, i: number) => i !== index)

  // Find conflicting entries.
  for (const i of tempList) {
    if (i.title === tempPromptKey.value) {
      message.error(t('store.editRepeatTitleTips'))
      saving.value = false
      return
    }
    if (i.value === tempPromptValue.value) {
      message.error(t('store.editRepeatContentTips', { msg: i.title }))
      saving.value = false
      return
    }
  }
  try {
    const userPrompt = new UserPrompt(tempPromptKey.value, tempPromptValue.value)
    userPrompt._id = tempModifiedItem.value._id
    const data = (await fetchUpsertUserPrompt(userPrompt)).data
    promptList.value = [{ title: tempPromptKey.value, value: tempPromptValue.value, _id: data._id }, ...tempList] as never
    message.success(t('common.editSuccess'))
    changeShowModal('modify')
  }
  finally {
    saving.value = false
  }
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

async function clearPromptTemplate() {
  await fetchClearUserPrompt()
  promptList.value = []
  message.success(t('common.clearSuccess'))
}

async function importPromptTemplate(from = 'online') {
  try {
    const jsonData = JSON.parse(tempPromptValue.value)
    let title = ''
    let value = ''
    // Extend with more template dictionary keys if needed.
    if ('key' in jsonData[0]) {
      title = 'key'
      value = 'value'
    }
    else if ('title' in jsonData[0]) {
      title = 'title'
      value = 'value'
    }
    else if ('act' in jsonData[0]) {
      title = 'act'
      value = 'prompt'
    }
    else {
      // Block unsupported dictionary keys to avoid breaking the prompt store.
      message.warning('prompt key not supported.')
      throw new Error('prompt key not supported.')
    }
    const newPromptList: DataProps[] = []
    for (const i of jsonData) {
      if (!(title in i) || !(value in i))
        throw new Error(t('store.importError'))
      let safe = true
      for (const j of promptList.value) {
        if (j.title === i[title]) {
          message.warning(t('store.importRepeatTitle', { msg: i[title] }))
          safe = false
          break
        }
        if (j.value === i[value]) {
          message.warning(t('store.importRepeatContent', { msg: i[title] }))
          safe = false
          break
        }
      }
      if (safe)
        newPromptList.unshift({ title: i[title], value: i[value] } as never)
    }
    await fetchImportUserPrompt(newPromptList as never)

    newPromptList.forEach((p: UserPrompt) => {
      promptList.value.unshift(p)
    })

    await handleGetUserPromptList()

    message.success(t('common.importSuccess'))
  }
  catch {
    message.error('JSON 格式错误，请检查 JSON 格式')
  }
  if (from === 'local')
    showModal.value = !showModal.value
}

// Template export.
function exportPromptTemplate() {
  exportLoading.value = true
  const exportData = promptList.value.map((item: UserPrompt) => {
    return {
      key: item.title,
      value: item.value,
    }
  })
  const jsonDataStr = JSON.stringify(exportData)
  const blob = new Blob([jsonDataStr], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'ChatGPTPromptTemplate.json'
  link.click()
  URL.revokeObjectURL(url)
  exportLoading.value = false
}

// Template online import.
async function downloadPromptTemplate() {
  try {
    importLoading.value = true
    const response = await fetch(downloadURL.value)
    const jsonData = await response.json()
    if ('key' in jsonData[0] && 'value' in jsonData[0])
      tempPromptValue.value = JSON.stringify(jsonData)
    if ('act' in jsonData[0] && 'prompt' in jsonData[0]) {
      const newJsonData = jsonData.map((item: { act: string, prompt: string }) => {
        return {
          key: item.act,
          value: item.prompt,
        }
      })
      tempPromptValue.value = JSON.stringify(newJsonData)
    }
    await importPromptTemplate()
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

// Mobile responsiveness.
function renderTemplate() {
  return promptList.value.map((item: UserPrompt) => {
    return {
      title: item.title,
      value: item.value,
      _id: item._id,
      type: item.type,
    }
  })
}

const pagination = computed(() => {
  const [pageSize, pageSlot] = isMobile.value ? [6, 5] : [7, 15]
  return {
    pageSize,
    pageSlot,
  }
})

// Table-related.
function createColumns(): DataTableColumns<DataProps> {
  return [
    {
      title: t('store.type'),
      key: 'type',
      width: 100,
      align: 'center',
      render: (row: DataProps) => row.type === 'built-in' ? t('store.builtIn') : t('store.userDefined'),
    },
    {
      title: t('store.title'),
      key: 'title',
      width: 200,
    },
    {
      title: t('store.description'),
      key: 'value',
      ellipsis: {
        lineClamp: 6,
        tooltip: {
          contentClass: 'whitespace-pre-line text-xs max-h-100 max-w-200',
          scrollable: true,
        },
      },
      className: 'whitespace-pre-line',
    },
    {
      title: t('common.action'),
      key: 'actions',
      width: 100,
      align: 'center',
      render(row) {
        if (row.type === 'built-in') {
          return ''
        }
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
          ), h(
            NButton,
            {
              tertiary: true,
              size: 'small',
              type: 'error',
              onClick: () => deletePromptTemplate(row),
            },
            { default: () => t('common.delete') },
          )],
        })
      },
    },
  ]
}

const columns = createColumns()

watch(
  () => promptList,
  () => {
    promptStore.updatePromptList(promptList.value)
  },
  { deep: true },
)

onMounted(async () => {
  if (!authStore.session?.auth)
    return
  await handleGetUserPromptList()
  promptStore.updatePromptList(promptList.value)
})

const dataSource = computed(() => {
  const data = renderTemplate()
  const value = searchValue.value
  if (value && value !== '') {
    return data.filter((item: DataProps) => {
      return item.title.includes(value) || item.value.includes(value)
    })
  }
  return data
})

async function handleGetUserPromptList() {
  if (loading.value)
    return
  loading.value = true
  promptList.value = []
  const data = (await fetchUserPromptList()).data
  data.data.forEach((d: UserPrompt) => {
    promptList.value.push(d)
  })
  loading.value = false
}
</script>

<template>
  <NModal v-model:show="show" style="width: 90%; max-width: 900px;" preset="card">
    <div class="space-y-4">
      <NTabs type="segment">
        <NTabPane name="local" :tab="t('store.local')">
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
                {{ t('common.add') }}
              </NButton>
              <NButton
                size="small"
                @click="changeShowModal('local_import')"
              >
                {{ t('common.import') }}
              </NButton>
              <NButton
                size="small"
                :loading="exportLoading"
                @click="exportPromptTemplate()"
              >
                {{ t('common.export') }}
              </NButton>
              <NPopconfirm @positive-click="clearPromptTemplate">
                <template #trigger>
                  <NButton size="small">
                    {{ t('common.clear') }}
                  </NButton>
                </template>
                {{ t('store.clearStoreConfirm') }}
              </NPopconfirm>
            </div>
            <div class="flex items-center">
              <NInput v-model:value="searchValue" style="width: 100%" />
            </div>
          </div>
          <NDataTable
            v-if="!isMobile"
            remote
            :max-height="400"
            :columns="columns"
            :data="dataSource"
            :pagination="pagination"
            :bordered="false"
            :loading="loading"
          />
          <NList v-if="isMobile" style="max-height: 400px; overflow-y: auto;">
            <NListItem v-for="(item, index) of dataSource" :key="index">
              <NThing :title="item.title" :description="item.value" description-class="text-xs">
                <template #description>
                  <NEllipsis
                    class="max-w-240 whitespace-pre-line"
                    :tooltip="{ contentClass: 'whitespace-pre-line text-xs max-h-100 max-w-90', scrollable: true }"
                    :line-clamp="3"
                  >
                    {{ item.value }}
                  </NEllipsis>
                </template>
              </NThing>>
              <template #suffix>
                <div v-if="item.type !== 'built-in'" class="flex flex-col items-center gap-2">
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
        <NTabPane name="download" :tab="t('store.online')">
          <p class="mb-4">
            {{ t('store.onlineImportWarning') }}
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
              {{ t('common.download') }}
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
        :disabled="inputStatus || saving"
        :loading="saving"
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
