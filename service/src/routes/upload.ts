import Router from 'express'
import multer from 'multer'
import { auth } from '../middleware/auth'
import { getS3FileUrl, isS3Enabled, uploadToS3 } from '../utils/s3'

export const router = Router()

// Configure Multer storage options (local storage).
const diskStorage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, 'uploads/') // Ensure this folder exists.
  },
  filename(req, file, cb) {
    cb(null, `${file.fieldname}-${Date.now()}`)
  },
})

// Memory storage (for S3 uploads).
const memoryStorage = multer.memoryStorage()

// Select storage mode based on configuration.
const upload = multer({ storage: diskStorage })
const uploadMemory = multer({ storage: memoryStorage })

router.post('/upload-image', auth, async (req, res) => {
  try {
    const useS3 = await isS3Enabled()

    if (useS3) {
      // Use S3 storage.
      uploadMemory.single('file')(req, res, async (err) => {
        if (err) {
          res.send({ status: 'Fail', message: '文件上传失败', data: null })
          return
        }

        if (!req.file) {
          res.send({ status: 'Fail', message: '没有文件被上传', data: null })
          return
        }

        try {
          const timestamp = Date.now()
          const randomStr = Math.random().toString(36).substring(2, 15)
          const originalName = req.file.originalname || 'file'
          const ext = originalName.includes('.') ? originalName.split('.').pop() : 'jpg'
          const fileName = `file-${timestamp}-${randomStr}.${ext}`

          // Upload to S3.
          const s3Key = await uploadToS3(req.file.buffer, fileName, req.file.mimetype)

          if (!s3Key) {
            res.send({ status: 'Fail', message: 'S3上传失败', data: null })
            return
          }

          // Get the S3 file URL.
          const fileUrl = await getS3FileUrl(s3Key)

          const data = {
            fileKey: s3Key,
            fileUrl: fileUrl || s3Key, // 如果获取URL失败，返回key
          }

          res.send({ status: 'Success', message: '文件上传成功', data })
        }
        catch (error) {
          globalThis.console.error('S3 upload error:', error)
          res.send({ status: 'Fail', message: 'S3上传失败', data: null })
        }
      })
    }
    else {
      // Use local storage.
      upload.single('file')(req, res, async (err) => {
        if (err) {
          res.send({ status: 'Fail', message: '文件上传失败', data: null })
          return
        }

        if (!req.file) {
          res.send({ status: 'Fail', message: '没有文件被上传', data: null })
          return
        }

        const data = {
          fileKey: req.file.filename,
        }
        // File uploaded.
        res.send({ status: 'Success', message: '文件上传成功', data })
      })
    }
  }
  catch (error) {
    globalThis.console.error('Upload error:', error)
    res.send({ status: 'Fail', message: '上传失败', data: null })
  }
})
