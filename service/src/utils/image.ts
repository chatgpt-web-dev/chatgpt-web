import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import * as fileType from 'file-type'
import { getCacheConfig } from '../storage/config'
import { getS3Client, isS3Enabled } from './s3'

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
  // 如果已经是完整的URL（S3 URL或自定义域名），直接返回
  if (uploadFileKey.startsWith('http://') || uploadFileKey.startsWith('https://')) {
    return uploadFileKey
  }

  let imageData: Buffer

  const useS3 = await isS3Enabled()

  if (useS3) {
    try {
      const client = await getS3Client()
      if (!client) {
        return await readFromLocal(uploadFileKey)
      }

      const config = await getCacheConfig()
      const siteConfig = config.siteConfig
      if (!siteConfig || !siteConfig.s3Bucket) {
        return await readFromLocal(uploadFileKey)
      }

      let s3Key = uploadFileKey
      if (!uploadFileKey.includes('/')) {
        const pathPrefix = siteConfig.s3PathPrefix || 'uploads/'
        s3Key = `${pathPrefix}${uploadFileKey}`
      }

      const command = new GetObjectCommand({
        Bucket: siteConfig.s3Bucket,
        Key: s3Key,
      })

      const response = await client.send(command)
      if (!response.Body) {
        globalThis.console.error(`S3 object body is empty for key ${s3Key}`)
        return await readFromLocal(uploadFileKey)
      }

      const chunks: Uint8Array[] = []
      for await (const chunk of response.Body as any) {
        chunks.push(chunk)
      }
      imageData = Buffer.concat(chunks)
    }
    catch (e) {
      globalThis.console.error(`Error reading from S3 ${uploadFileKey}, trying local: ${e.message}`)
      return await readFromLocal(uploadFileKey)
    }
  }
  else {
    // 从本地文件系统读取
    return await readFromLocal(uploadFileKey)
  }

  // 判断文件格式
  const imageType = await fileType.fileTypeFromBuffer(imageData)
  if (!imageType) {
    globalThis.console.error(`Cannot determine file type for ${uploadFileKey}`)
    return undefined
  }
  const mimeType = imageType.mime
  // 将图片数据转换为 Base64 编码的字符串
  const base64Image = imageData.toString('base64')
  return `data:${mimeType};base64,${base64Image}`
}

/**
 * 从本地文件系统读取图片
 */
async function readFromLocal(uploadFileKey: string): Promise<string | undefined> {
  try {
    const imageData = await fs.readFile(`uploads/${uploadFileKey}`)
    // 判断文件格式
    const imageType = await fileType.fileTypeFromBuffer(imageData)
    if (!imageType) {
      globalThis.console.error(`Cannot determine file type for ${uploadFileKey}`)
      return undefined
    }
    const mimeType = imageType.mime
    // 将图片数据转换为 Base64 编码的字符串
    const base64Image = imageData.toString('base64')
    return `data:${mimeType};base64,${base64Image}`
  }
  catch (e) {
    globalThis.console.error(`Error reading local file ${uploadFileKey}, ${e.message}`)
    return undefined
  }
}

/**
 * 将 base64 图片数据保存为文件（本地或S3）
 * @param base64Data base64 图片数据（可能包含 data:image/png;base64, 前缀）
 * @returns 文件名或S3 URL（用于显示）
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

    // 检查是否使用S3存储
    const useS3 = await isS3Enabled()

    if (useS3) {
      // 上传到S3
      const { uploadToS3, getS3FileUrl } = await import('./s3')
      const s3Key = await uploadToS3(imageBuffer, fileName, 'image/png')

      if (s3Key) {
        // 获取S3文件的访问URL
        const fileUrl = await getS3FileUrl(s3Key)
        // 返回S3 URL，如果没有URL则返回S3 key
        return fileUrl || s3Key
      }
      else {
        // S3上传失败，回退到本地存储
        globalThis.console.warn('S3 upload failed, falling back to local storage')
      }
    }

    // 保存文件到本地
    const filePath = `uploads/${fileName}`
    await fs.writeFile(filePath, imageBuffer)

    // 返回文件名（用于 URL，如 /uploads/filename.png）
    return fileName
  }
  catch (e) {
    globalThis.console.error(`Error saving base64 to file: ${e.message}`)
    return undefined
  }
}
