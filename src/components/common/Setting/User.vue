<script lang="ts" setup>
import type { DataTableColumns } from 'naive-ui'
import { NButton, NTag } from 'naive-ui'
import { fetchDisableUser2FAByAdmin, fetchGetUsers, fetchUpdateUser, fetchUpdateUserStatus } from '@/api'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { Status, UserInfo, UserRole, userRoleOptions } from './model'

const { t } = useI18n()

const ms = useMessage()
const dialog = useDialog()
const { isMobile } = useBasicLayout()
const loading = ref(false)
const show = ref(false)
const handleSaving = ref(false)
const userRef = ref(new UserInfo([UserRole.User]))

const users = ref([])

function createColumns(): DataTableColumns {
  return [
    {
      title: 'Email',
      key: 'email',
      resizable: true,
      width: 200,
      minWidth: 80,
      maxWidth: 200,
    },
    {
      title: 'Register Time',
      key: 'createTime',
      resizable: true,
      width: 200,
      minWidth: 80,
      maxWidth: 200,
    },
    {
      title: 'Verify Time',
      key: 'verifyTime',
      resizable: true,
      width: 200,
      minWidth: 80,
      maxWidth: 200,
    },
    {
      title: 'Roles',
      key: 'status',
      resizable: true,
      width: 200,
      minWidth: 80,
      maxWidth: 200,
      render(row: any) {
        const roles = row.roles.map((role: UserRole) => {
          return h(
            NTag,
            {
              style: {
                marginRight: '6px',
              },
              type: 'info',
              bordered: false,
            },
            {
              default: () => UserRole[role],
            },
          )
        })
        return roles
      },
    },
    {
      title: 'Status',
      key: 'status',
      width: 80,
      render(row: any) {
        return Status[row.status]
      },
    },
    {
      title: 'Remark',
      key: 'remark',
      resizable: true,
      width: 200,
      minWidth: 80,
      maxWidth: 200,
    },
    // switch off amt limit
    {
      title: 'Limit Enabled',
      key: 'limit_switch',
      resizable: true,
      width: 100,
      minWidth: 30,
      maxWidth: 100,
      render(row: any) {
        return h('div', row.limit_switch ? 'True' : 'False')
      },
    },
    // 新增额度信息
    {
      title: 'Amounts',
      key: 'useAmount',
      resizable: true,
      width: 80,
      minWidth: 30,
      maxWidth: 100,
    },
    {
      title: 'Action',
      key: '_id',
      width: 220,
      fixed: 'right',
      render(row: any) {
        const actions: any[] = []
        actions.push(h(
          NButton,
          {
            size: 'small',
            type: 'error',
            style: {
              marginRight: '6px',
            },
            onClick: () => handleUpdateUserStatus(row._id, Status.Deleted),
          },
          { default: () => t('common.delete') },
        ))
        if (row.status === Status.Normal) {
          actions.push(h(
            NButton,
            {
              size: 'small',
              type: 'primary',
              style: {
                marginRight: '8px',
              },
              onClick: () => handleEditUser(row),
            },
            { default: () => t('chat.editUser') },
          ))
        }
        if (row.status === Status.PreVerify || row.status === Status.AdminVerify) {
          actions.push(h(
            NButton,
            {
              size: 'small',
              type: 'info',
              onClick: () => handleUpdateUserStatus(row._id, Status.Normal),
            },
            { default: () => t('chat.verifiedUser') },
          ))
        }
        if (row.secretKey) {
          actions.push(h(
            NButton,
            {
              size: 'small',
              type: 'warning',
              onClick: () => handleDisable2FA(row._id),
            },
            { default: () => t('chat.disable2FA') },
          ))
        }
        return actions
      },
    },
  ]
}

const columns = createColumns()

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
    handleGetUsers(pagination.page)
  },
  onUpdatePageSize: (pageSize: number) => {
    pagination.pageSize = pageSize
    pagination.page = 1
    handleGetUsers(pagination.page)
  },
})

async function handleGetUsers(page: number) {
  if (loading.value)
    return
  users.value.length = 0
  loading.value = true
  const size = pagination.pageSize
  const data = (await fetchGetUsers(page, size)).data
  data.users.forEach((user: never) => {
    users.value.push(user)
  })
  pagination.page = page
  pagination.pageCount = data.total / size + (data.total % size === 0 ? 0 : 1)
  pagination.itemCount = data.total
  loading.value = false
}

async function handleUpdateUserStatus(userId: string, status: Status) {
  if (status === Status.Deleted) {
    dialog.warning({
      title: t('chat.deleteUser'),
      content: t('chat.deleteUserConfirm'),
      positiveText: t('common.yes'),
      negativeText: t('common.no'),
      onPositiveClick: async () => {
        await fetchUpdateUserStatus(userId, status)
        ms.info('OK')
        await handleGetUsers(pagination.page)
      },
    })
  }
  else {
    await fetchUpdateUserStatus(userId, status)
    ms.info('OK')
    await handleGetUsers(pagination.page)
  }
}

async function handleDisable2FA(userId: string) {
  dialog.warning({
    title: t('chat.disable2FA'),
    content: t('chat.disable2FAConfirm'),
    positiveText: t('common.yes'),
    negativeText: t('common.no'),
    onPositiveClick: async () => {
      const result = await fetchDisableUser2FAByAdmin(userId)
      ms.success(result.message as string)
      await handleGetUsers(pagination.page)
    },
  })
}

function handleNewUser() {
  userRef.value = new UserInfo([UserRole.User])
  show.value = true
}

function handleEditUser(user: UserInfo) {
  userRef.value = user
  show.value = true
}

async function handleUpdateUser() {
  handleSaving.value = true
  try {
    await fetchUpdateUser(userRef.value)
    await handleGetUsers(pagination.page)
    show.value = false
  }
  catch (error: any) {
    ms.error(error.message)
  }
  handleSaving.value = false
}

onMounted(async () => {
  await handleGetUsers(pagination.page)
})
</script>

<template>
  <div class="p-4 space-y-5 min-h-[200px]">
    <div class="space-y-6">
      <NSpace vertical :size="12">
        <NSpace>
          <NButton @click="handleNewUser()">
            New User
          </NButton>
        </NSpace>
        <NDataTable
          remote
          :loading="loading"
          :row-key="(rowData) => rowData._id"
          :columns="columns"
          :data="users"
          :pagination="pagination"
          :max-height="444"
          striped
          :scroll-x="1800"
          @update:page="handleGetUsers"
        />
      </NSpace>
    </div>
  </div>

  <NModal v-model:show="show" :auto-focus="false" preset="card" :style="{ width: !isMobile ? '33%' : '100%' }">
    <div class="p-4 space-y-5 min-h-[200px]">
      <div class="space-y-6">
        <div class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]">{{ $t('setting.email') }}</span>
          <div class="flex-1">
            <NInput
              v-model:value="userRef.email"
              :disabled="userRef._id !== undefined" placeholder="email"
            />
          </div>
        </div>

        <div class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]">{{ $t('setting.password') }}</span>
          <div class="flex-1">
            <NInput
              v-model:value="userRef.password"
              type="password"
              placeholder="password"
            />
          </div>
        </div>
        <div class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]">{{ $t('setting.userRoles') }}</span>
          <div class="flex-1">
            <NSelect
              style="width: 100%"
              multiple
              :value="userRef.roles"
              :options="userRoleOptions"
              @update-value="value => userRef.roles = value"
            />
          </div>
        </div>
        <div class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]">{{ $t('setting.remark') }}</span>
          <div class="flex-1">
            <NInput
              v-model:value="userRef.remark" type="textarea"
              :autosize="{ minRows: 1, maxRows: 2 }" placeholder=""
            />
          </div>
        </div>
        <div class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]">{{ $t('setting.useAmount') }}</span>
          <div class="flex-1">
            <NInputNumber
              v-model:value="userRef.useAmount"
              :autosize="{ minRows: 1, maxRows: 2 }" placeholder=""
            />
          </div>
        </div>
        <div class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]">{{ $t('setting.limit_switch') }}</span>
          <div class="flex-1">
            <NSwitch
              v-model:value="userRef.limit_switch"
              :round="false"
              @update:value="(val) => { if (userRef) userRef.limit_switch = val }"
            />
          </div>
        </div>
        <div class="flex items-center space-x-4">
          <span class="shrink-0 w-[100px]" />
          <NButton type="primary" :loading="handleSaving" @click="handleUpdateUser()">
            {{ $t('common.save') }}
          </NButton>
        </div>
      </div>
    </div>
  </NModal>
</template>
