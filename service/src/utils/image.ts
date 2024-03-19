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

export async function convertImageUrl(uploadFileKey: string): Promise<string> {
  try {
    const imageData = await fs.readFile(`uploads/${uploadFileKey}`)
    const imageType = await fileType.fileTypeFromBuffer(imageData)

    if (!imageType) {
      throw new Error('不支持的图片格式')
    }

    let mimeType: string
    switch (imageType.mime) {
      case 'image/png':
      case 'image/jpeg':
      case 'image/webp':
      case 'image/gif':
        mimeType = imageType.mime
        break
      default:
        throw new Error('不支持的图片格式')
        break
    }

    // 将图片数据转换为 Base64 编码的字符串，并返回带有正确 MIME 类型的字符串
    const base64Image = imageData.toString('base64')
    return `data:${mimeType};base64,${base64Image}`
  } catch (error) {
    console.error('转换图片 URL 出错:', error)
    return null
  }
}
