<script setup lang='ts'>
import type { ChartData, ChartOptions } from 'chart.js'
import type { UserInfo } from './model'
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, Title, Tooltip } from 'chart.js'
import dayjs from 'dayjs'
import { Bar } from 'vue-chartjs'
import { fetchGetUsers, fetchUserStatistics, fetchUserStatisticsByModel } from '@/api'
import { SvgIcon } from '@/components/common'
import { useUserStore } from '@/store'

const { t } = useI18n()

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale)

const statisticsChart = ref<typeof Bar | null>(null)

const userStore = useUserStore()

const chartData: ChartData<'bar'> = reactive({
  labels: [],
  datasets: [
    {
      label: t('setting.statisticsPrompt'),
      data: [],
      borderColor: '#a1dc95',
      backgroundColor: '#a1dc95',
      stack: 'Usage',
    },
    {
      label: t('setting.statisticsCompletion'),
      data: [],
      borderColor: '#6d6e7e',
      backgroundColor: '#6d6e7e',
      stack: 'Usage',
    },
  ],
})
const chartOptions: ChartOptions<'bar'> = {
  responsive: true,
  aspectRatio: window.innerWidth / window.innerHeight * 1.5,
}
const summary = ref({
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
})

const usersOptions: Ref<{ label: string, filter: string, value: string }[]> = ref([])
const user: Ref<string | null> = ref(null)

const loading = ref(false)
const range: any = ref([
  dayjs().subtract(30, 'day').startOf('day').valueOf(),
  dayjs().endOf('day').valueOf(),
])

// 导出选项
const exportOptions = computed(() => [
  {
    label: t('setting.exportByDate') || '按日期导出',
    key: 'byDate',
  },
  {
    label: `${t('setting.exportUsage') || '用量导出'} ${t('setting.exportUsageTip') || '(包含工具调用次数，分key)'}`,
    key: 'usage',
  },
])
const rangeShortcuts: { [index: string]: [number, number] } = {}
// today
rangeShortcuts[t('setting.statisticsPeriodToday')] = [
  dayjs().startOf('day').valueOf(),
  dayjs().endOf('day').valueOf(),
]
// last 7 days
rangeShortcuts[t('setting.statisticsPeriodLast7Days')] = [
  dayjs().subtract(6, 'day').startOf('day').valueOf(),
  dayjs().endOf('day').valueOf(),
]
// last week
rangeShortcuts[t('setting.statisticsPeriodLastWeek')] = [
  dayjs().subtract(1, 'week').startOf('week').valueOf(),
  dayjs().subtract(1, 'week').endOf('week').valueOf(),
]
// last month
rangeShortcuts[t('setting.statisticsPeriodLastMonth')] = [
  dayjs().subtract(1, 'month').startOf('month').valueOf(),
  dayjs().subtract(1, 'month').endOf('month').valueOf(),
]
// current month
rangeShortcuts[t('setting.statisticsPeriodCurrentMonth')] = [
  dayjs().startOf('month').valueOf(),
  dayjs().endOf('month').valueOf(),
]
// last 30 days
rangeShortcuts[t('setting.statisticsPeriodLast30Days')] = [
  dayjs().subtract(30, 'day').startOf('day').valueOf(),
  dayjs().endOf('day').valueOf(),
]

async function fetchStatistics() {
  try {
    loading.value = true
    const { data } = await fetchUserStatistics(
      user.value as string,
      dayjs(range.value[0]).startOf('day').valueOf(),
      dayjs(range.value[1]).endOf('day').valueOf(),
    )

    if (Object.keys(data.chartData).length) {
      summary.value.promptTokens = data.promptTokens
      summary.value.completionTokens = data.completionTokens
      summary.value.totalTokens = data.totalTokens

      chartData.labels = data.chartData.map((item: any) => item._id)
      chartData.datasets[0].data = data.chartData.map((item: any) => item.promptTokens)
      chartData.datasets[1].data = data.chartData.map((item: any) => item.completionTokens)

      reRenderChart()
    }
  }
  finally {
    loading.value = false
  }
}

async function fetchUsers() {
  const result = await fetchGetUsers(1, 10000)
  result.data.users.forEach((user: UserInfo) => {
    usersOptions.value.push({
      label: `${user.email}`,
      value: `${user._id}`,
      filter: `${user.email} ${user.remark}`,
    })
  })
}

function reRenderChart() {
  if (statisticsChart.value) {
    chartOptions.aspectRatio = window.innerWidth / window.innerHeight * 1.5
    statisticsChart.value.chart.options = chartOptions
    statisticsChart.value.chart.data = chartData
    statisticsChart.value.chart.update()
  }
}

function filter(pattern: string, option: object): boolean {
  const a = option as { label: string, filter: string, value: string }
  return !a.filter ? false : a.filter.includes(pattern)
}

// 按日期统计导出（原来的数据导出）
function exportStatisticsByDate() {
  if (!chartData.labels || chartData.labels.length === 0) {
    return
  }

  // 准备 CSV 数据
  const csvRows = []
  // CSV 头部（使用英文列名以确保兼容性）
  csvRows.push(['Date', 'Prompt Tokens', 'Completion Tokens', 'Total Tokens'].join(','))
  // 数据行
  if (chartData.labels && Array.isArray(chartData.labels)) {
    chartData.labels.forEach((label: any, index: number) => {
      const promptTokens = chartData.datasets[0].data[index] || 0
      const completionTokens = chartData.datasets[1].data[index] || 0
      const totalTokens = Number(promptTokens) + Number(completionTokens)
      csvRows.push([String(label), promptTokens, completionTokens, totalTokens].join(','))
    })
  }
  // 汇总行
  csvRows.push(['Total', summary.value.promptTokens, summary.value.completionTokens, summary.value.totalTokens].join(','))
  // 创建 CSV 内容
  const csvContent = csvRows.join('\n')
  // 添加 BOM 以支持中文
  const BOM = '\uFEFF'
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
  // 创建下载链接
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)
  link.setAttribute('href', url)
  // 生成文件名
  const startDate = dayjs(range.value[0]).format('YYYY-MM-DD')
  const endDate = dayjs(range.value[1]).format('YYYY-MM-DD')
  const fileName = `statistics_by_date_${startDate}_${endDate}.csv`
  link.setAttribute('download', fileName)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // 清理 URL 对象
  URL.revokeObjectURL(url)
}

// 用量导出（按模型统计，包含工具调用次数，分key，按日期分组）
async function exportUsageStatistics() {
  try {
    loading.value = true
    const { data } = await fetchUserStatisticsByModel(
      dayjs(range.value[0]).startOf('day').valueOf(),
      dayjs(range.value[1]).endOf('day').valueOf(),
    )
    if (!data || data.length === 0) {
      return
    }
    const csvRows = []
    // CSV 头部：包含日期列
    csvRows.push(['User Email', 'Model Name', 'Model Key', 'Date', 'Prompt Tokens', 'Completion Tokens', 'Total Tokens', 'Image Count', 'Image OutPutTokens', 'Usage Count'].join(','))

    // 数据行：遍历每个用户、每个模型和每个日期
    data.forEach((userData: any) => {
      userData.models.forEach((model: any) => {
        // 如果有日期分组数据，导出每天的详细数据
        if (model.dates && Array.isArray(model.dates) && model.dates.length > 0) {
          model.dates.forEach((dateData: any) => {
            csvRows.push([
              userData.userEmail || '',
              model.modelName || model.modelKey,
              model.modelKey || '',
              dateData.date || '',
              dateData.promptTokens || 0,
              dateData.completionTokens || 0,
              dateData.totalTokens || 0,
              dateData.imageCount || 0,
              dateData.imageOutputTokens || 0,
              dateData.usageCount || 0,
            ].join(','))
          })
        }
        else {
          // 如果没有日期分组数据，导出总计数据（兼容旧数据）
          csvRows.push([
            userData.userEmail || '',
            model.modelName || model.modelKey,
            model.modelKey || '',
            'Total', // 日期列显示为 Total
            model.promptTokens || 0,
            model.completionTokens || 0,
            model.totalTokens || 0,
            model.imageCount || 0,
            model.imageOutputTokens || 0,
            model.usageCount || 0,
          ].join(','))
        }
      })
    })

    // 创建 CSV 内容
    const csvContent = csvRows.join('\n')

    // 添加 BOM 以支持中文
    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })

    // 创建下载链接
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)

    // 生成文件名
    const startDate = dayjs(range.value[0]).format('YYYY-MM-DD')
    const endDate = dayjs(range.value[1]).format('YYYY-MM-DD')
    const fileName = `usage_statistics_${startDate}_${endDate}.csv`
    link.setAttribute('download', fileName)

    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    // 清理 URL 对象
    URL.revokeObjectURL(url)
  }
  catch (error) {
    console.error('导出统计数据失败:', error)
  }
  finally {
    loading.value = false
  }
}

function handleExportSelect(key: string) {
  if (key === 'byDate') {
    exportStatisticsByDate()
  }
  else if (key === 'usage') {
    exportUsageStatistics()
  }
}

onMounted(() => {
  window.addEventListener('resize', reRenderChart)
  fetchStatistics()
  fetchUsers()
})

onUnmounted(() => {
  window.removeEventListener('resize', reRenderChart)
})
</script>

<template>
  <NSpin :show="loading">
    <div class="p-4 space-y-5 min-h-[200px]">
      <div class="space-y-6">
        <div class="flex items-center space-x-4">
          <NSelect
            v-if="userStore.userInfo.root"
            v-model:value="user"
            style="width: 250px"
            filterable
            :filter="filter"
            placeholder="Email or remark"
            :options="usersOptions"
            @update-value="(value) => { user = value; fetchStatistics() }"
          />
          <div class="flex-1">
            <NDatePicker
              v-model:value="range"
              type="daterange"
              :shortcuts="rangeShortcuts"
              @update:value="fetchStatistics"
            />
          </div>
          <NDropdown
            :options="exportOptions"
            @select="handleExportSelect"
          >
            <NButton
              type="primary"
              :loading="loading"
            >
              <template #icon>
                <NIcon>
                  <SvgIcon icon="ri:download-line" />
                </NIcon>
              </template>
              {{ t('common.export') }}
              <NIcon class="ml-1">
                <SvgIcon icon="ri:arrow-down-s-line" />
              </NIcon>
            </NButton>
          </NDropdown>
        </div>

        <div class="flex items-center space-x-4">
          <NRow>
            <NCol :span="8" class="text-center">
              <NStatistic :label="t('setting.statisticsPrompt')">
                <template #prefix>
                  <NIcon>
                    <SvgIcon class="text-lg" icon="ri-chat-upload-line" />
                  </NIcon>
                </template>
                <NNumberAnimation :duration="1000" :to="summary.promptTokens" />
              </NStatistic>
            </NCol>
            <NCol :span="8" class="text-center">
              <NStatistic :label="t('setting.statisticsCompletion')">
                <template #prefix>
                  <NIcon>
                    <SvgIcon class="text-lg" icon="ri-chat-download-line" />
                  </NIcon>
                </template>
                <NNumberAnimation :duration="1000" :to="summary.completionTokens" />
              </NStatistic>
            </NCol>
            <NCol :span="8" class="text-center">
              <NStatistic :label="t('setting.statisticsTotal')">
                <template #prefix>
                  <NIcon>
                    <SvgIcon class="text-lg" icon="ri-question-answer-line" />
                  </NIcon>
                </template>
                <NNumberAnimation :duration="1000" :to="summary.totalTokens" />
              </NStatistic>
            </NCol>
          </NRow>
        </div>

        <Bar
          v-if="chartData.labels?.length"
          ref="statisticsChart"
          :options="chartOptions"
          :data="chartData"
        />
      </div>
    </div>
  </NSpin>
</template>

<style>

</style>
