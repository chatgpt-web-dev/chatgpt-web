import type { UserPrompt } from '../storage/model'
import Router from 'express'
import { ObjectId } from 'mongodb'
import { auth } from '../middleware/auth'
import {
  clearUserPrompt,
  deleteUserPrompt,
  getBuiltInPromptList,
  getUserPromptList,
  importUserPrompt,
  upsertUserPrompt,
} from '../storage/mongo'

export const router = Router()

router.get('/prompt-list', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string

    // 获取用户自定义提示词
    const userPrompts = await getUserPromptList(userId)
    const userResult = []
    userPrompts.data.forEach((p) => {
      userResult.push({
        _id: p._id,
        title: p.title,
        value: p.value,
        type: 'user-defined',
      })
    })

    // 获取平台预置提示词
    const builtInPrompts = await getBuiltInPromptList()
    const builtInResult = []
    builtInPrompts.data.forEach((p) => {
      builtInResult.push({
        _id: p._id,
        title: p.title,
        value: p.value,
        type: 'built-in',
      })
    })

    // 合并两种类型的提示词
    const allPrompts = [...userResult, ...builtInResult]
    const totalCount = userPrompts.total + builtInPrompts.total

    res.send({
      status: 'Success',
      message: null,
      data: {
        data: allPrompts,
        total: totalCount,
        userTotal: userPrompts.total,
        builtInTotal: builtInPrompts.total,
      },
    })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/prompt-upsert', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const userPrompt = req.body as UserPrompt
    if (userPrompt._id !== undefined)
      userPrompt._id = new ObjectId(userPrompt._id)
    userPrompt.userId = userId
    const newUserPrompt = await upsertUserPrompt(userPrompt)
    res.send({ status: 'Success', message: '成功 | Successfully', data: { _id: newUserPrompt._id.toHexString() } })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/prompt-delete', auth, async (req, res) => {
  try {
    const { id } = req.body as { id: string }
    await deleteUserPrompt(id)
    res.send({ status: 'Success', message: '成功 | Successfully' })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/prompt-clear', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    await clearUserPrompt(userId)
    res.send({ status: 'Success', message: '成功 | Successfully' })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/prompt-import', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const userPrompt = req.body as UserPrompt[]
    const updatedUserPrompt = userPrompt.map((prompt) => {
      return {
        ...prompt,
        userId,
      }
    })
    await importUserPrompt(updatedUserPrompt)
    res.send({ status: 'Success', message: '成功 | Successfully' })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})
