<script lang="ts" setup>
import type { DataTableColumns } from 'naive-ui'
import { NButton, NTooltip } from 'naive-ui'
import { fetchBuiltInPromptList, fetchDeleteBuiltInPrompt, fetchUpsertBuiltInPrompt } from '@/api'
import { BuiltInPrompt } from '@/components/common/Setting/model'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { rankBetween } from '@/utils/lexorank'

const { t } = useI18n()
const message = useMessage()
const dialog = useDialog()
const { isMobile } = useBasicLayout()

const loading = ref(false)
const showModal = ref(false)
const modalMode = ref<'add' | 'edit'>('add')
const saving = ref(false)
const ordering = ref(false)

const promptList = ref<BuiltInPrompt[]>([])
const draggingId = ref<string | null>(null)
const editingId = ref<string | undefined>(undefined)
const tempPromptKey = ref('')
const tempPromptValue = ref('')

const inputDisabled = computed(() => tempPromptKey.value.trim().length < 1 || tempPromptValue.value.trim().length < 1)

function getPrevRank(list: BuiltInPrompt[], startIndex: number) {
  for (let i = startIndex - 1; i >= 0; i--) {
    if (list[i].order)
      return list[i].order
  }
  return null
}

function getNextRank(list: BuiltInPrompt[], startIndex: number) {
  for (let i = startIndex + 1; i < list.length; i++) {
    if (list[i].order)
      return list[i].order
  }
  return null
}

async function updatePromptOrder(item: BuiltInPrompt) {
  if (ordering.value)
    return
  ordering.value = true
  try {
    const builtInPrompt = new BuiltInPrompt(item.title, item.value)
    builtInPrompt._id = item._id
    builtInPrompt.order = item.order
    await fetchUpsertBuiltInPrompt(builtInPrompt)
  }
  finally {
    ordering.value = false
  }
}

async function ensurePromptOrder() {
  const updates: BuiltInPrompt[] = []
  let lastRank: string | null = null
  for (let i = 0; i < promptList.value.length; i++) {
    const item = promptList.value[i]
    if (item.order) {
      lastRank = item.order
      continue
    }
    let nextRank: string | null = null
    for (let j = i + 1; j < promptList.value.length; j++) {
      const next = promptList.value[j]
      if (next.order) {
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
      const builtInPrompt = new BuiltInPrompt(item.title, item.value)
      builtInPrompt._id = item._id
      builtInPrompt.order = item.order
      return fetchUpsertBuiltInPrompt(builtInPrompt)
    }))
  }
  finally {
    ordering.value = false
  }
}

function openModal(mode: 'add' | 'edit', row?: BuiltInPrompt) {
  modalMode.value = mode
  if (mode === 'add') {
    editingId.value = undefined
    tempPromptKey.value = ''
    tempPromptValue.value = ''
  }
  else if (row) {
    editingId.value = row._id
    tempPromptKey.value = row.title
    tempPromptValue.value = row.value
  }
  showModal.value = true
}

async function handleGetBuiltInPrompts() {
  if (loading.value)
    return
  loading.value = true
  try {
    const data = (await fetchBuiltInPromptList()).data
    promptList.value = data.data || []
    await ensurePromptOrder()
  }
  finally {
    loading.value = false
  }
}

async function handleSavePrompt() {
  if (saving.value)
    return
  saving.value = true
  const title = tempPromptKey.value.trim()
  const value = tempPromptValue.value.trim()
  // Compare against non-editing rows to avoid title/content collisions.
  const list = promptList.value.filter(item => item._id !== editingId.value)
  const existingTitle = list.find(item => item.title === title)
  if (existingTitle) {
    message.error(t(modalMode.value === 'add' ? 'store.addRepeatTitleTips' : 'store.editRepeatTitleTips'))
    saving.value = false
    return
  }
  const existingValue = list.find(item => item.value === value)
  if (existingValue) {
    message.error(t(modalMode.value === 'add' ? 'store.addRepeatContentTips' : 'store.editRepeatContentTips', { msg: existingValue.title }))
    saving.value = false
    return
  }

  try {
    const builtInPrompt = new BuiltInPrompt(title, value)
    if (editingId.value) {
      builtInPrompt._id = editingId.value
      builtInPrompt.order = promptList.value.find(item => item._id === editingId.value)?.order
    }
    else {
      builtInPrompt.order = rankBetween(null, promptList.value[0]?.order ?? null)
    }

    const data = (await fetchUpsertBuiltInPrompt(builtInPrompt)).data
    if (editingId.value) {
      const index = promptList.value.findIndex(item => item._id === editingId.value)
      if (index !== -1)
        promptList.value.splice(index, 1, { ...builtInPrompt, _id: data._id })
      message.success(t('common.editSuccess'))
    }
    else {
      promptList.value.unshift({ ...builtInPrompt, _id: data._id })
      message.success(t('common.addSuccess'))
    }
    showModal.value = false
  }
  finally {
    saving.value = false
  }
}

function handleDeletePrompt(row: BuiltInPrompt) {
  if (!row._id)
    return
  dialog.warning({
    title: t('common.delete'),
    content: t('setting.builtInPromptDeleteConfirm'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: async () => {
      await fetchDeleteBuiltInPrompt(row._id as string)
      promptList.value = promptList.value.filter(item => item._id !== row._id)
      message.success(t('common.deleteSuccess'))
    },
  })
}

function createColumns(): DataTableColumns<BuiltInPrompt> {
  return [
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
        const disabled = ordering.value
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
      width: 120,
      align: 'center',
      render(row) {
        return h('div', { class: 'flex items-center flex-col gap-2' }, {
          default: () => [h(
            NButton,
            {
              tertiary: true,
              size: 'small',
              type: 'info',
              onClick: () => openModal('edit', row),
            },
            { default: () => [h(IconRiEdit2Line, { class: 'mr-1 text-base' }), t('common.edit')] },
          ), h(
            NButton,
            {
              tertiary: true,
              size: 'small',
              type: 'error',
              onClick: () => handleDeletePrompt(row),
            },
            { default: () => [h(IconRiDeleteBinLine, { class: 'mr-1 text-base' }), t('common.delete')] },
          )],
        })
      },
    },
  ]
}

const columns = createColumns()

function movePrompt(sourceId: string, targetId: string) {
  const sourceIndex = promptList.value.findIndex(item => item._id === sourceId)
  const targetIndex = promptList.value.findIndex(item => item._id === targetId)
  if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex)
    return
  const [moved] = promptList.value.splice(sourceIndex, 1)
  promptList.value.splice(targetIndex, 0, moved)
}

async function handleDrop(target: BuiltInPrompt) {
  if (!draggingId.value)
    return
  const sourceId = draggingId.value
  draggingId.value = null
  movePrompt(sourceId, target._id as string)
  const movedIndex = promptList.value.findIndex(item => item._id === sourceId)
  if (movedIndex === -1)
    return
  const prevRank = getPrevRank(promptList.value, movedIndex)
  const nextRank = getNextRank(promptList.value, movedIndex)
  const moved = promptList.value[movedIndex]
  moved.order = rankBetween(prevRank, nextRank)
  await updatePromptOrder(moved)
}

async function moveToTop(row: BuiltInPrompt) {
  const index = promptList.value.findIndex(item => item._id === row._id)
  if (index <= 0)
    return
  const [moved] = promptList.value.splice(index, 1)
  promptList.value.unshift(moved)
  const nextRank = promptList.value[1]?.order ?? null
  moved.order = rankBetween(null, nextRank)
  await updatePromptOrder(moved)
}

async function moveToBottom(row: BuiltInPrompt) {
  const index = promptList.value.findIndex(item => item._id === row._id)
  if (index === -1 || index === promptList.value.length - 1)
    return
  const [moved] = promptList.value.splice(index, 1)
  promptList.value.push(moved)
  const prevRank = promptList.value[promptList.value.length - 2]?.order ?? null
  moved.order = rankBetween(prevRank, null)
  await updatePromptOrder(moved)
}

function rowProps(row: BuiltInPrompt) {
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

onMounted(async () => {
  await handleGetBuiltInPrompts()
})
</script>

<template>
  <div class="box-border h-full flex-1 min-h-0 overflow-hidden px-4 pb-4 pt-2" style="height: 100%;">
    <div class="flex h-full min-h-0 flex-col gap-3">
      <div class="flex items-center justify-end shrink-0">
        <NButton size="small" type="primary" @click="openModal('add')">
          <IconRiAddLine class="mr-1 text-base" />
          {{ t('common.add') }}
        </NButton>
      </div>
      <NDataTable
        class="flex-1 min-h-0"
        :loading="loading"
        :row-key="(rowData) => rowData._id"
        :columns="columns"
        :data="promptList"
        :row-props="rowProps"
        flex-height
        striped
      />
    </div>
  </div>

  <NModal v-model:show="showModal" :auto-focus="false" preset="card" :style="{ width: !isMobile ? '50%' : '100%' }">
    <div class="p-4 space-y-5 min-h-[200px]">
      <div class="space-y-6">
        <div class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]">{{ t('store.title') }}</span>
          <div class="flex-1">
            <NInput v-model:value="tempPromptKey" placeholder="" />
          </div>
        </div>
        <div class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]">{{ t('store.description') }}</span>
          <div class="flex-1">
            <NInput v-model:value="tempPromptValue" type="textarea" :autosize="{ minRows: 4, maxRows: 10 }" />
          </div>
        </div>
        <div class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]" />
          <NButton type="primary" :disabled="inputDisabled || saving" :loading="saving" @click="handleSavePrompt">
            {{ modalMode === 'add' ? t('common.add') : t('common.save') }}
          </NButton>
        </div>
      </div>
    </div>
  </NModal>
</template>
