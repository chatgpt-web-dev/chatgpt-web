<script lang="ts" setup>
import type { DataTableColumns } from 'naive-ui'
import { NButton } from 'naive-ui'
import { fetchBuiltInPromptList, fetchDeleteBuiltInPrompt, fetchUpsertBuiltInPrompt } from '@/api'
import { BuiltInPrompt } from '@/components/common/Setting/model'
import { useBasicLayout } from '@/hooks/useBasicLayout'

const { t } = useI18n()
const message = useMessage()
const dialog = useDialog()
const { isMobile } = useBasicLayout()

const loading = ref(false)
const showModal = ref(false)
const modalMode = ref<'add' | 'edit'>('add')

const promptList = ref<BuiltInPrompt[]>([])
const editingId = ref<string | undefined>(undefined)
const tempPromptKey = ref('')
const tempPromptValue = ref('')

const inputDisabled = computed(() => tempPromptKey.value.trim().length < 1 || tempPromptValue.value.trim().length < 1)

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
  }
  finally {
    loading.value = false
  }
}

async function handleSavePrompt() {
  const title = tempPromptKey.value.trim()
  const value = tempPromptValue.value.trim()
  // Compare against non-editing rows to avoid title/content collisions.
  const list = promptList.value.filter(item => item._id !== editingId.value)
  const existingTitle = list.find(item => item.title === title)
  if (existingTitle) {
    message.error(t(modalMode.value === 'add' ? 'store.addRepeatTitleTips' : 'store.editRepeatTitleTips'))
    return
  }
  const existingValue = list.find(item => item.value === value)
  if (existingValue) {
    message.error(t(modalMode.value === 'add' ? 'store.addRepeatContentTips' : 'store.editRepeatContentTips', { msg: existingValue.title }))
    return
  }

  const builtInPrompt = new BuiltInPrompt(title, value)
  if (editingId.value)
    builtInPrompt._id = editingId.value

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
            { default: () => t('common.edit') },
          ), h(
            NButton,
            {
              tertiary: true,
              size: 'small',
              type: 'error',
              onClick: () => handleDeletePrompt(row),
            },
            { default: () => t('common.delete') },
          )],
        })
      },
    },
  ]
}

const columns = createColumns()

onMounted(async () => {
  await handleGetBuiltInPrompts()
})
</script>

<template>
  <div class="p-4 space-y-5 min-h-[300px]">
    <div class="space-y-6">
      <NSpace vertical :size="12">
        <NSpace>
          <NButton @click="openModal('add')">
            {{ t('common.add') }}
          </NButton>
        </NSpace>
        <NDataTable
          :loading="loading"
          :row-key="(rowData) => rowData._id"
          :columns="columns"
          :data="promptList"
          :max-height="444"
          striped
        />
      </NSpace>
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
          <NButton type="primary" :disabled="inputDisabled" @click="handleSavePrompt">
            {{ modalMode === 'add' ? t('common.add') : t('common.save') }}
          </NButton>
        </div>
      </div>
    </div>
  </NModal>
</template>
