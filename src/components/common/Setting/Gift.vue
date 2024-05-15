<script setup lang='ts'>
import { ref } from 'vue'
import type { UploadFileInfo } from 'naive-ui'
import { NButton, NDataTable, NDivider, NIcon, NP, NSpace, NSwitch, NText, NUpload, NUploadDragger, useMessage } from 'naive-ui'
import type { GiftCard } from './model'
import { SvgIcon } from '@/components/common'
import { fetchUpdateGiftCards } from '@/api'
import { t } from '@/locales'

const ms = useMessage()
const loading = ref(false)
const overRideSwitch = ref(true)
const fileListRef = ref<UploadFileInfo[]>([])

const handleSaving = ref(false)
const columns = [
  {
    title: 'cardno',
    key: 'cardno',
    resizable: true,
    width: 100,
    minWidth: 100,
    maxWidth: 200,
  },
  {
    title: 'amount',
    key: 'amount',
    width: 80,
  },
  {
    title: 'redeemed',
    key: 'redeemed',
    width: 100,
  },
]

const csvData = ref<Array<GiftCard>>([])

// const csvData: giftcard[] = [
//   {
//     cardno: 'dfsdfasf',
//     amount: 10,
//     redeemed: 0,
//   },
//   {
//     cardno: 'ooioioo',
//     amount: 20,
//     redeemed: 0,
//   },
//   {
//     cardno: '765653',
//     amount: 30,
//     redeemed: 1,
//   },
// ]

function readfile(file: Blob) {
  try {
    // const file = event.target.files[0]
    if (file) {
      ms.info('生成预览中 | Generating Preview')
      const reader = new FileReader()
      reader.onload = (e) => {
        const contents = e.target?.result as string
        csvData.value = parseCSV(contents)
      }
      reader.readAsText(file)
    }
    else {
      ms.info('没有读取到文件 | No file find')
    }
  }
  catch (error: any) {
    ms.info(`读取文件出错 | Error reading file | ${error.message}`)
  }
}

function parseCSV(content: string) {
  const rows = content.trim().split(/\r?\n/)
  //   const headers = rows[0].split(',')
  const giftCards: GiftCard[] = rows.slice(1).map(row => row.split(',')).map(row => ({
    cardno: row[0],
    amount: Number(row[1].trim()),
    redeemed: Number(row[2].trim()),
  }))
  return giftCards
}

function handleUploadChange(data: { file: UploadFileInfo; fileList: Array<UploadFileInfo>; event?: Event }) {
  fileListRef.value = data.fileList
  csvData.value = []
  if (data.event) {
    const file_bolb = data.fileList[0].file
    if (file_bolb)
      readfile(file_bolb)
  }
}

async function uploadGiftCards() {
  handleSaving.value = true
  try {
    if (csvData.value.length > 0)
      await fetchUpdateGiftCards(csvData.value, overRideSwitch.value)
    ms.success(`${t('common.success')}`)
  }
  catch (error: any) {
    ms.error(`Failed update DB ${error.message}`)
  }

  handleSaving.value = false
}
</script>

<template>
  <div class="p-4 space-y-5 min-h-[300px]">
    <div class="space-y-6">
      <NUpload
        :max="1"
        accept=".csv"
        :on-change="handleUploadChange"
      >
        <NUploadDragger>
          <div style="margin-bottom: 12px">
            <NIcon size="48" :depth="3">
              <SvgIcon icon="mage:box-upload" />
            </NIcon>
          </div>
          <NText style="font-size: 16px">
            点击或者拖动文件到该区域来上传|Upload CSV
          </NText>
          <NP depth="3" style="margin: 8px 0 0 0">
            请不要上传敏感数据，文件仅限csv（2k行内），表头为cardno,amount,redeemed<br>
            warning: duplicated cardno will not be detected in this process
          </NP>
        </NUploadDragger>
      </NUpload>

      <NSpace vertical :size="12">
        <span class="flex-shrink-0 w-[100px]">Data Preview(Top 30) & Due to body-parser limits csv files >2k rows not supported </span>
        <NDataTable
          remote
          :loading="loading"
          :row-key="(rowData:GiftCard) => rowData.cardno"
          :columns="columns"
          :data="csvData.slice(0, 30)"
          :max-height="200"
        />
      </NSpace>
    </div>
    <NDivider />
    <div class="flex items-center space-x-4">
      <span class="flex-shrink-0 w-[100px]">{{ $t('setting.overRide') }}</span>
      <div class="flex-1">
        <NSwitch v-model:value="overRideSwitch" />
      </div>
      <div class="flex-1">
        <NButton type="primary" :loading="handleSaving" size="large" @click="uploadGiftCards()">
          {{ $t('setting.uploadgifts') }}
        </NButton>
      </div>
    </div>
  </div>
</template>
