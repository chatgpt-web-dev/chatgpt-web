import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
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

/**
 * 将 base64 图片数据保存为本地文件
 * @param base64Data base64 图片数据（可能包含 data:image/png;base64, 前缀）
 * @returns 本地文件名（用于 URL 显示）
 */
export async function saveBase64ToFile(base64Data: string): Promise<string | undefined> {
  try {
    // 移除 data:image/png;base64, 前缀（如果存在）
    const base64String = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data
    const imageBuffer = Buffer.from(base64String, 'base64')

    // 生成文件名
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 15)
    const fileName = `image-${timestamp}-${randomStr}.png`
    const filePath = `uploads/${fileName}`

    // 保存文件到本地（保留文件用于显示）
    await fs.writeFile(filePath, imageBuffer)

    // 返回文件名（用于 URL，如 /uploads/filename.png）
    return fileName
  }
  catch (e) {
    globalThis.console.error(`Error saving base64 to file: ${e.message}`)
    return undefined
  }
}
