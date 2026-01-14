<script setup lang='ts'>
import type { DataTableColumns } from 'naive-ui'
import { NButton, NTooltip } from 'naive-ui'
import { fetchClearUserPrompt, fetchDeleteUserPrompt, fetchImportUserPrompt, fetchUpsertUserPrompt, fetchUserPromptList } from '@/api'
import { UserPrompt } from '@/components/common/Setting/model'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAuthStoreWithout, usePromptStore } from '@/store'
import { rankBetween } from '@/utils/lexorank'

const props = defineProps<Props>()

const emit = defineEmits<Emit>()

const { t } = useI18n()

interface DataProps {
  _id?: string
  title: string
  value: string
  type: 'built-in' | 'user-defined'
  order?: string
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
const ordering = ref(false)
const saving = ref(false)

const exportLoading = ref(false)

const searchValue = ref<string>('')

const authStore = useAuthStoreWithout()

const promptStore = usePromptStore()

// Mobile responsiveness.
const { isMobile } = useBasicLayout()

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

// Control input button state.
const inputStatus = computed (() => tempPromptKey.value.trim().length < 1 || tempPromptValue.value.trim().length < 1)

function getFirstUserIndex(list: DataProps[]) {
  return list.findIndex(item => item.type !== 'built-in')
}

function getLastUserIndex(list: DataProps[]) {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].type !== 'built-in')
      return i
  }
  return -1
}

function getPrevUserRank(list: DataProps[], startIndex: number) {
  for (let i = startIndex - 1; i >= 0; i--) {
    if (list[i].type !== 'built-in')
      return list[i].order ?? null
  }
  return null
}

function getNextUserRank(list: DataProps[], startIndex: number) {
  for (let i = startIndex + 1; i < list.length; i++) {
    if (list[i].type !== 'built-in')
      return list[i].order ?? null
  }
  return null
}

async function updatePromptOrder(item: DataProps) {
  if (ordering.value)
    return
  ordering.value = true
  try {
    const userPrompt = new UserPrompt(item.title, item.value)
    userPrompt._id = item._id
    userPrompt.order = item.order
    await fetchUpsertUserPrompt(userPrompt)
  }
  finally {
    ordering.value = false
  }
}

async function ensurePromptOrder() {
  const updates: DataProps[] = []
  let lastRank: string | null = null
  for (let i = 0; i < promptList.value.length; i++) {
    const item: DataProps = promptList.value[i]
    if (item.type === 'built-in')
      continue
    if (item.order) {
      lastRank = item.order
      continue
    }
    let nextRank: string | null = null
    for (let j = i + 1; j < promptList.value.length; j++) {
      const next: DataProps = promptList.value[j]
      if (next.type !== 'built-in' && next.order) {
        nextRank = next.order
        break
      }
    }
    const rank = rankBetween(lastRank, nextRank)
    item.order = rank
    lastRank = rank
    updates.push(item)
  }
  if (!updates.length || ordering.value)
    return
  ordering.value = true
  try {
    await Promise.all(updates.map((item) => {
      const userPrompt = new UserPrompt(item.title, item.value)
      userPrompt._id = item._id
      userPrompt.order = item.order
      return fetchUpsertUserPrompt(userPrompt)
    }))
  }
  finally {
    ordering.value = false
  }
}

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
    const firstUserIndex = getFirstUserIndex(promptList.value)
    const firstRank = firstUserIndex === -1 ? null : promptList.value[firstUserIndex].order ?? null
    userPrompt.order = rankBetween(null, firstRank)
    const data = (await fetchUpsertUserPrompt(userPrompt)).data
    const insertIndex = firstUserIndex === -1 ? 0 : firstUserIndex
    promptList.value.splice(insertIndex, 0, { title: tempPromptKey.value, value: tempPromptValue.value, _id: data._id, order: userPrompt.order } as never)
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
    userPrompt.order = tempModifiedItem.value.order
    const data = (await fetchUpsertUserPrompt(userPrompt)).data
    promptList.value = [{ title: tempPromptKey.value, value: tempPromptValue.value, _id: data._id, order: userPrompt.order }, ...tempList] as never
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
      if (safe) {
        newPromptList.unshift({ title: i[title], value: i[value] } as never)
      }
    }
    await fetchImportUserPrompt(newPromptList as never)

    const firstUserIndex = getFirstUserIndex(promptList.value)
    let firstRank = firstUserIndex === -1 ? null : promptList.value[firstUserIndex].order ?? null
    newPromptList.forEach((p: DataProps) => {
      const nextRank = rankBetween(null, firstRank)
      p.order = nextRank
      firstRank = nextRank
      const insertIndex = firstUserIndex === -1 ? 0 : firstUserIndex
      promptList.value.splice(insertIndex, 0, p)
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

// Mobile responsiveness.
function renderTemplate() {
  return promptList.value.map((item: UserPrompt) => {
    return {
      title: item.title,
      value: item.value,
      _id: item._id,
      type: item.type,
      order: item.order,
    }
  })
}

const draggingId = ref<string | null>(null)
const isSearchActive = computed(() => searchValue.value.trim().length > 0)

function canReorder(row: DataProps) {
  return row.type !== 'built-in' && !isSearchActive.value
}

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
      title: t('store.sort'),
      key: 'sort',
      width: 120,
      align: 'center',
      render(row) {
        if (!canReorder(row))
          return ''
        const disabled = ordering.value || isSearchActive.value
        return h('div', { class: 'flex items-center justify-center gap-1' }, {
          default: () => [
            h(
              NTooltip,
              null,
              {
                trigger: () => h(
                  NButton,
                  {
                    tertiary: true,
                    size: 'small',
                    draggable: true,
                    disabled,
                    onDragstart: (event: DragEvent) => {
                      draggingId.value = row._id as string
                      event.dataTransfer?.setData('text/plain', row._id as string)
                    },
                    onDragend: () => {
                      draggingId.value = null
                    },
                  },
                  { default: () => h(IconMdiReorderHorizontal) },
                ),
                default: () => t('store.drag'),
              },
            ),
            h(
              NTooltip,
              null,
              {
                trigger: () => h(
                  NButton,
                  {
                    tertiary: true,
                    size: 'small',
                    disabled,
                    onClick: () => moveToTop(row),
                  },
                  { default: () => h(IconMdiFormatVerticalAlignTop) },
                ),
                default: () => t('store.moveTop'),
              },
            ),
            h(
              NTooltip,
              null,
              {
                trigger: () => h(
                  NButton,
                  {
                    tertiary: true,
                    size: 'small',
                    disabled,
                    onClick: () => moveToBottom(row),
                  },
                  { default: () => h(IconMdiFormatVerticalAlignBottom) },
                ),
                default: () => t('store.moveBottom'),
              },
            ),
          ],
        })
      },
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

function movePrompt(sourceId: string, targetId: string) {
  const sourceIndex = promptList.value.findIndex((item: DataProps) => item._id === sourceId)
  const targetIndex = promptList.value.findIndex((item: DataProps) => item._id === targetId)
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex)
    return
  const [moved] = promptList.value.splice(sourceIndex, 1)
  promptList.value.splice(targetIndex, 0, moved)
}

function handleMobileDragOver(event: DragEvent, item: DataProps) {
  if (canReorder(item))
    event.preventDefault()
}

function handleMobileDragStart(event: DragEvent, item: DataProps) {
  draggingId.value = item._id as string
  event.dataTransfer?.setData('text/plain', item._id as string)
}

function handleMobileDragEnd() {
  draggingId.value = null
}

async function handleDrop(target: DataProps) {
  if (!draggingId.value || !canReorder(target))
    return
  const sourceId = draggingId.value
  draggingId.value = null
  movePrompt(sourceId, target._id as string)
  const movedIndex = promptList.value.findIndex((item: DataProps) => item._id === sourceId)
  if (movedIndex === -1)
    return
  const prevRank = getPrevUserRank(promptList.value, movedIndex)
  const nextRank = getNextUserRank(promptList.value, movedIndex)
  const moved = promptList.value[movedIndex]
  moved.order = rankBetween(prevRank, nextRank)
  await updatePromptOrder(moved)
}

async function moveToTop(row: DataProps) {
  if (!row._id || !canReorder(row))
    return
  const index = promptList.value.findIndex((item: DataProps) => item._id === row._id)
  const firstIndex = getFirstUserIndex(promptList.value)
  if (index === -1 || firstIndex === -1 || index === firstIndex)
    return
  const [moved] = promptList.value.splice(index, 1)
  const nextFirstIndex = getFirstUserIndex(promptList.value)
  const insertIndex = nextFirstIndex === -1 ? 0 : nextFirstIndex
  promptList.value.splice(insertIndex, 0, moved)
  const firstRank = promptList.value[insertIndex + 1]?.order ?? null
  moved.order = rankBetween(null, firstRank)
  await updatePromptOrder(moved)
}

async function moveToBottom(row: DataProps) {
  if (!row._id || !canReorder(row))
    return
  const index = promptList.value.findIndex((item: DataProps) => item._id === row._id)
  const lastUserIndex = getLastUserIndex(promptList.value)
  if (index === -1 || lastUserIndex === -1 || index === lastUserIndex)
    return
  const [moved] = promptList.value.splice(index, 1)
  const nextLastUserIndex = getLastUserIndex(promptList.value)
  const insertIndex = nextLastUserIndex === -1 ? 0 : nextLastUserIndex + 1
  promptList.value.splice(insertIndex, 0, moved)
  const prevRank = promptList.value[insertIndex - 1]?.order ?? null
  moved.order = rankBetween(prevRank, null)
  await updatePromptOrder(moved)
}

function rowProps(row: DataProps) {
  if (!canReorder(row)) {
    return {}
  }
  return {
    onDragover: (event: DragEvent) => {
      event.preventDefault()
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault()
      handleDrop(row)
    },
  }
}

async function handleGetUserPromptList() {
  if (loading.value)
    return
  loading.value = true
  promptList.value = []
  const data = (await fetchUserPromptList()).data
  data.data.forEach((d: UserPrompt) => {
    promptList.value.push(d)
  })
  await ensurePromptOrder()
  loading.value = false
}
</script>

<template>
  <NModal v-model:show="show" style="width: 95%; max-width: 1100px;" preset="card">
    <div class="space-y-4">
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
        :max-height="520"
        :columns="columns"
        :data="dataSource"
        :row-props="rowProps"
        :bordered="false"
        :loading="loading"
      />
      <NList v-if="isMobile" style="max-height: 520px; overflow-y: auto;">
        <NListItem
          v-for="(item, index) of dataSource"
          :key="index"
          @dragover="handleMobileDragOver($event, item)"
          @drop="() => handleDrop(item)"
        >
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
              <div class="flex items-center gap-1">
                <NTooltip>
                  <template #trigger>
                    <NButton
                      tertiary
                      size="small"
                      :disabled="ordering || isSearchActive"
                      draggable="true"
                      @dragstart="handleMobileDragStart($event, item)"
                      @dragend="handleMobileDragEnd"
                    >
                      <IconMdiReorderHorizontal />
                    </NButton>
                  </template>
                  {{ t('store.drag') }}
                </NTooltip>
                <NTooltip>
                  <template #trigger>
                    <NButton
                      tertiary
                      size="small"
                      :disabled="ordering || isSearchActive"
                      @click="moveToTop(item)"
                    >
                      <IconMdiFormatVerticalAlignTop />
                    </NButton>
                  </template>
                  {{ t('store.moveTop') }}
                </NTooltip>
                <NTooltip>
                  <template #trigger>
                    <NButton
                      tertiary
                      size="small"
                      :disabled="ordering || isSearchActive"
                      @click="moveToBottom(item)"
                    >
                      <IconMdiFormatVerticalAlignBottom />
                    </NButton>
                  </template>
                  {{ t('store.moveBottom') }}
                </NTooltip>
              </div>
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
