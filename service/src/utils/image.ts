import fs from 'node:fs/promises'
import type { Buffer } from 'node:buffer'
import * as fileType from 'file-type'

fs.mkdir('uploads').then(() => {
  globalThis.console.log('Directory uploads created')
}).catch((e) => {
  if (e.code === 'EEXIST') {
    globalThis.console.log('Directory uploads already exists')
    return
  }
  globalThis.console.error('Error creating directory uploads, ', e)
})

export async function convertImageUrl(uploadFileKey: string): Promise<string | undefined> {
  let imageData: Buffer
  try {
    imageData = await fs.readFile(`uploads/${uploadFileKey}`)
  }
  catch (e) {
    globalThis.console.error(`Error open uploads file ${uploadFileKey}, ${e.message}`)
    return
  }
  // 判断文件格式
  const imageType = await fileType.fileTypeFromBuffer(imageData)
  const mimeType = imageType.mime
  // 将图片数据转换为 Base64 编码的字符串
  const base64Image = imageData.toString('base64')
  return `data:${mimeType};base64,${base64Image}`
}
