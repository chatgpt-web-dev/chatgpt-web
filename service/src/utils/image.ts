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
  // If already a full URL (S3 or custom domain), return as-is.
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
    // Read from local filesystem.
    return await readFromLocal(uploadFileKey)
  }

  // Detect file format.
  const imageType = await fileType.fileTypeFromBuffer(imageData)
  if (!imageType) {
    globalThis.console.error(`Cannot determine file type for ${uploadFileKey}`)
    return undefined
  }
  const mimeType = imageType.mime
  // Convert image data to a Base64-encoded string.
  const base64Image = imageData.toString('base64')
  return `data:${mimeType};base64,${base64Image}`
}

/**
 * Read an image from the local filesystem.
 */
async function readFromLocal(uploadFileKey: string): Promise<string | undefined> {
  try {
    const imageData = await fs.readFile(`uploads/${uploadFileKey}`)
    // Detect file format.
    const imageType = await fileType.fileTypeFromBuffer(imageData)
    if (!imageType) {
      globalThis.console.error(`Cannot determine file type for ${uploadFileKey}`)
      return undefined
    }
    const mimeType = imageType.mime
    // Convert image data to a Base64-encoded string.
    const base64Image = imageData.toString('base64')
    return `data:${mimeType};base64,${base64Image}`
  }
  catch (e) {
    globalThis.console.error(`Error reading local file ${uploadFileKey}, ${e.message}`)
    return undefined
  }
}

/**
 * Save base64 image data to a file (local or S3).
 * @param base64Data base64 image data (may include data:image/png;base64, prefix)
 * @returns File name or S3 URL (for display)
 */
export async function saveBase64ToFile(base64Data: string): Promise<string | undefined> {
  try {
    // Remove data:image/png;base64, prefix if present.
    const base64String = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data
    const imageBuffer = Buffer.from(base64String, 'base64')

    // Generate filename.
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(2, 15)
    const fileName = `image-${timestamp}-${randomStr}.png`

    // Check whether S3 storage is enabled.
    const useS3 = await isS3Enabled()

    if (useS3) {
      // Upload to S3.
      const { uploadToS3, getS3FileUrl } = await import('./s3')
      const s3Key = await uploadToS3(imageBuffer, fileName, 'image/png')

      if (s3Key) {
        // Get the S3 file URL.
        const fileUrl = await getS3FileUrl(s3Key)
        // Return S3 URL or fall back to the S3 key.
        return fileUrl || s3Key
      }
      else {
        // S3 upload failed; fall back to local storage.
        globalThis.console.warn('S3 upload failed, falling back to local storage')
      }
    }

    // Save file locally.
    const filePath = `uploads/${fileName}`
    await fs.writeFile(filePath, imageBuffer)

    // Return filename for URL usage (e.g., /uploads/filename.png).
    return fileName
  }
  catch (e) {
    globalThis.console.error(`Error saving base64 to file: ${e.message}`)
    return undefined
  }
}
