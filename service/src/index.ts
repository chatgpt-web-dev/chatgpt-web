import * as path from 'node:path'
import express from 'express'
import jwt from 'jsonwebtoken'
import * as dotenv from 'dotenv'
import { ObjectId } from 'mongodb'
import speakeasy from 'speakeasy'
import { TwoFAConfig } from './types'
import type { AuthJwtPayload } from './types'
import { chatConfig, containsSensitiveWords, initAuditService } from './chatgpt'
import { auth, getUserId } from './middleware/auth'
import { clearApiKeyCache, clearConfigCache, getApiKeys, getCacheApiKeys, getCacheConfig, getOriginConfig } from './storage/config'
import type { AnnounceConfig, AuditConfig, Config, GiftCard, KeyConfig, MailConfig, SiteConfig, UserConfig, UserInfo } from './storage/model'
import { AdvancedConfig, Status, UserRole } from './storage/model'
import {
  createChatRoom,
  createUser,
  deleteChatRoom,
  disableUser2FA,
  existsChatRoom,
  getAmtByCardNo,
  getChatRooms,
  getChatRoomsCount,
  getUser,
  getUserById,
  getUserStatisticsByDay,
  getUsers,
  renameChatRoom,
  updateApiKeyStatus,
  updateConfig,
  updateGiftCard,
  updateGiftCards,
  updateRoomChatModel,
  updateRoomPrompt,
  updateRoomUsingContext,
  updateUser,
  updateUser2FA,
  updateUserAdvancedConfig,
  updateUserAmount,
  updateUserChatModel,
  updateUserInfo,
  updateUserPassword,
  updateUserPasswordWithVerifyOld,
  updateUserStatus,
  upsertKey,
  verifyUser,
} from './storage/mongo'
import { authLimiter } from './middleware/limiter'
import { hasAnyRole, isEmail, isNotEmptyString } from './utils/is'
import { sendNoticeMail, sendResetPasswordMail, sendTestMail, sendVerifyMail, sendVerifyMailAdmin } from './utils/mail'
import { checkUserResetPassword, checkUserVerify, checkUserVerifyAdmin, getUserResetPasswordUrl, getUserVerifyUrl, getUserVerifyUrlAdmin, md5 } from './utils/security'
import { isAdmin, rootAuth } from './middleware/rootAuth'

import { router as chatRouter } from './routes/chat'
import { router as promptRouter } from './routes/prompt'
import { router as uploadRouter } from './routes/upload'

dotenv.config()

const app = express()
const router = express.Router()

app.use(express.static('public', {
  setHeaders: (res, filePath) => {
    if (path.extname(filePath) === '.html')
      res.setHeader('Cache-Control', 'public, max-age=0')
    else
      res.setHeader('Cache-Control', 'public, max-age=31536000')
  },
}))

app.use(express.json())

app.use('/uploads', express.static('uploads'))

app.all('/', (_, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'authorization, Content-Type')
  res.header('Access-Control-Allow-Methods', '*')
  next()
})

router.get('/chatrooms', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const rooms = await getChatRooms(userId)
    const result = []
    rooms.forEach((r) => {
      result.push({
        uuid: r.roomId,
        title: r.title,
        isEdit: false,
        prompt: r.prompt,
        usingContext: r.usingContext === undefined ? true : r.usingContext,
        chatModel: r.chatModel,
      })
    })
    res.send({ status: 'Success', message: null, data: result })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Load error', data: [] })
  }
})

function formatTimestamp(timestamp: number) {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

router.get('/chatrooms-count', auth, async (req, res) => {
  try {
    const userId = req.query.userId as string
    const page = +req.query.page
    const size = +req.query.size
    const rooms = await getChatRoomsCount(userId, page, size)
    const result = []
    rooms.data.forEach((r) => {
      result.push({
        uuid: r.roomId,
        title: r.title,
        userId: r.userId,
        name: r.username,
        lastTime: formatTimestamp(r.dateTime),
        chatCount: r.chatCount,
      })
    })
    res.send({ status: 'Success', message: null, data: { data: result, total: rooms.total } })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Load error', data: [] })
  }
})

router.post('/room-create', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const { title, roomId, chatModel } = req.body as { title: string; roomId: number; chatModel: string }
    const room = await createChatRoom(userId, title, roomId, chatModel)
    res.send({ status: 'Success', message: null, data: room })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Create error', data: null })
  }
})

router.post('/room-rename', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const { title, roomId } = req.body as { title: string; roomId: number }
    const success = await renameChatRoom(userId, title, roomId)
    if (success)
      res.send({ status: 'Success', message: null, data: null })
    else
      res.send({ status: 'Fail', message: 'Saved Failed', data: null })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Rename error', data: null })
  }
})

router.post('/room-prompt', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const { prompt, roomId } = req.body as { prompt: string; roomId: number }
    const success = await updateRoomPrompt(userId, roomId, prompt)
    if (success)
      res.send({ status: 'Success', message: 'Saved successfully', data: null })
    else
      res.send({ status: 'Fail', message: 'Saved Failed', data: null })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Rename error', data: null })
  }
})

router.post('/room-chatmodel', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const { chatModel, roomId } = req.body as { chatModel: string; roomId: number }
    const success = await updateRoomChatModel(userId, roomId, chatModel)
    if (success)
      res.send({ status: 'Success', message: 'Saved successfully', data: null })
    else
      res.send({ status: 'Fail', message: 'Saved Failed', data: null })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Rename error', data: null })
  }
})

router.post('/room-context', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const { using, roomId } = req.body as { using: boolean; roomId: number }
    const success = await updateRoomUsingContext(userId, roomId, using)
    if (success)
      res.send({ status: 'Success', message: 'Saved successfully', data: null })
    else
      res.send({ status: 'Fail', message: 'Saved Failed', data: null })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Rename error', data: null })
  }
})

router.post('/room-delete', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const { roomId } = req.body as { roomId: number }
    if (!roomId || !await existsChatRoom(userId, roomId)) {
      res.send({ status: 'Fail', message: 'Unknown room', data: null })
      return
    }
    const success = await deleteChatRoom(userId, roomId)
    if (success)
      res.send({ status: 'Success', message: null, data: null })
    else
      res.send({ status: 'Fail', message: 'Saved Failed', data: null })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Delete error', data: null })
  }
})

router.post('/user-register', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body as { username: string; password: string }
    const config = await getCacheConfig()
    if (!config.siteConfig.registerEnabled) {
      res.send({ status: 'Fail', message: '注册账号功能未启用 | Register account is disabled!', data: null })
      return
    }
    if (!isEmail(username)) {
      res.send({ status: 'Fail', message: '请输入正确的邮箱 | Please enter a valid email address.', data: null })
      return
    }
    if (isNotEmptyString(config.siteConfig.registerMails)) {
      let allowSuffix = false
      const emailSuffixs = config.siteConfig.registerMails.split(',')
      for (let index = 0; index < emailSuffixs.length; index++) {
        const element = emailSuffixs[index]
        allowSuffix = username.toLowerCase().endsWith(element)
        if (allowSuffix)
          break
      }
      if (!allowSuffix) {
        res.send({ status: 'Fail', message: '该邮箱后缀不支持 | The email service provider is not allowed', data: null })
        return
      }
    }

    const user = await getUser(username)
    if (user != null) {
      if (user.status === Status.PreVerify) {
        await sendVerifyMail(username, await getUserVerifyUrl(username))
        throw new Error('请去邮箱中验证 | Please verify in the mailbox')
      }
      if (user.status === Status.AdminVerify)
        throw new Error('请等待管理员开通 | Please wait for the admin to activate')
      res.send({ status: 'Fail', message: '账号已存在 | The email exists', data: null })
      return
    }
    const newPassword = md5(password)
    const isRoot = username.toLowerCase() === process.env.ROOT_USER
    await createUser(username, newPassword, isRoot ? [UserRole.Admin] : [UserRole.User])

    if (isRoot) {
      res.send({ status: 'Success', message: '注册成功 | Register success', data: null })
    }
    else {
      await sendVerifyMail(username, await getUserVerifyUrl(username))
      res.send({ status: 'Success', message: '注册成功, 去邮箱中验证吧 | Registration is successful, you need to go to email verification', data: null })
    }
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/config', rootAuth, async (req, res) => {
  try {
    const userId = req.headers.userId.toString()
    if (!isAdmin(userId))
      throw new Error('无权限 | No permission.')

    const response = await chatConfig()
    res.send(response)
  }
  catch (error) {
    res.send(error)
  }
})

router.post('/session', async (req, res) => {
  try {
    const config = await getCacheConfig()
    const hasAuth = config.siteConfig.loginEnabled || config.siteConfig.authProxyEnabled
    const authProxyEnabled = config.siteConfig.authProxyEnabled
    const allowRegister = config.siteConfig.registerEnabled
    if (config.apiModel !== 'ChatGPTAPI' && config.apiModel !== 'ChatGPTUnofficialProxyAPI')
      config.apiModel = 'ChatGPTAPI'
    const userId = await getUserId(req)
    const chatModels: {
      label
      key: string
      value: string
    }[] = []

    const chatModelOptions = config.siteConfig.chatModels.split(',').map((model: string) => {
      let label = model
      if (model === 'text-davinci-002-render-sha-mobile')
        label = 'gpt-3.5-mobile'
      return {
        label,
        key: model,
        value: model,
      }
    })

    let userInfo: { name: string; description: string; avatar: string; userId: string; root: boolean; roles: UserRole[]; config: UserConfig; advanced: AdvancedConfig }
    if (userId != null) {
      const user = await getUserById(userId)
      if (user === null) {
        globalThis.console.error(`session userId ${userId} but query user is null.`)
        res.send({
          status: 'Success',
          message: '',
          data: {
            auth: hasAuth,
            allowRegister,
            model: config.apiModel,
            title: config.siteConfig.siteTitle,
            chatModels,
            allChatModels: chatModelOptions,
            showWatermark: config.siteConfig?.showWatermark,
          },
        })
        return
      }

      userInfo = {
        name: user.name,
        description: user.description,
        avatar: user.avatar,
        userId: user._id.toString(),
        root: user.roles.includes(UserRole.Admin),
        roles: user.roles,
        config: user.config,
        advanced: user.advanced,
      }

      const keys = (await getCacheApiKeys()).filter(d => hasAnyRole(d.userRoles, user.roles))

      const count: { key: string; count: number }[] = []
      chatModelOptions.forEach((chatModel) => {
        keys.forEach((key) => {
          if (key.chatModels.includes(chatModel.value)) {
            if (count.filter(d => d.key === chatModel.value).length <= 0) {
              count.push({ key: chatModel.value, count: 1 })
            }
            else {
              const thisCount = count.filter(d => d.key === chatModel.value)[0]
              thisCount.count++
            }
          }
        })
      })
      count.forEach((c) => {
        const thisChatModel = chatModelOptions.filter(d => d.value === c.key)[0]
        const suffix = c.count > 1 ? ` (${c.count})` : ''
        chatModels.push({
          label: `${thisChatModel.label}${suffix}`,
          key: c.key,
          value: c.key,
        })
      })

      res.send({
        status: 'Success',
        message: '',
        data: {
          auth: hasAuth,
          authProxyEnabled,
          allowRegister,
          model: config.apiModel,
          title: config.siteConfig.siteTitle,
          chatModels,
          allChatModels: chatModelOptions,
          usageCountLimit: config.siteConfig?.usageCountLimit,
          showWatermark: config.siteConfig?.showWatermark,
          userInfo,
        },
      })
      return
    }

    res.send({
      status: 'Success',
      message: '',
      data: {
        auth: hasAuth,
        authProxyEnabled,
        allowRegister,
        model: config.apiModel,
        title: config.siteConfig.siteTitle,
        chatModels: chatModelOptions, // if userId is null which means in nologin mode, open all model options, otherwise user can only choose gpt-3.5-turbo
        allChatModels: chatModelOptions,
        showWatermark: config.siteConfig?.showWatermark,
        userInfo,
      },
    })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/user-login', authLimiter, async (req, res) => {
  try {
    const { username, password, token } = req.body as { username: string; password: string; token?: string }
    if (!username || !password || !isEmail(username))
      throw new Error('用户名或密码为空 | Username or password is empty')

    const user = await getUser(username)
    if (user == null || user.password !== md5(password))
      throw new Error('用户不存在或密码错误 | User does not exist or incorrect password.')
    if (user.status === Status.PreVerify)
      throw new Error('请去邮箱中验证 | Please verify in the mailbox')
    if (user != null && user.status === Status.AdminVerify)
      throw new Error('请等待管理员开通 | Please wait for the admin to activate')
    if (user.status !== Status.Normal)
      throw new Error('账户状态异常 | Account status abnormal.')
    if (user.secretKey) {
      if (token) {
        const verified = speakeasy.totp.verify({
          secret: user.secretKey,
          encoding: 'base32',
          token,
        })
        if (!verified)
          throw new Error('验证码错误 | Two-step verification code error')
      }
      else {
        res.send({ status: 'Success', message: '需要两步验证 | Two-step verification required', data: { need2FA: true } })
        return
      }
    }

    const config = await getCacheConfig()
    const jwtToken = jwt.sign({
      name: user.name ? user.name : user.email,
      avatar: user.avatar,
      description: user.description,
      userId: user._id.toString(),
      root: user.roles.includes(UserRole.Admin),
      config: user.config,
    } as AuthJwtPayload, config.siteConfig.loginSalt.trim())
    res.send({ status: 'Success', message: '登录成功 | Login successfully', data: { token: jwtToken } })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/user-logout', async (req, res) => {
  res.send({ status: 'Success', message: '退出登录成功 | Logout successful', data: null })
})

router.post('/user-send-reset-mail', authLimiter, async (req, res) => {
  try {
    const { username } = req.body as { username: string }
    if (!username || !isEmail(username))
      throw new Error('请输入格式正确的邮箱 | Please enter a correctly formatted email address.')

    const user = await getUser(username)
    if (user == null || user.status !== Status.Normal)
      throw new Error('账户状态异常 | Account status abnormal.')
    await sendResetPasswordMail(username, await getUserResetPasswordUrl(username))
    res.send({ status: 'Success', message: '重置邮件已发送 | Reset email has been sent', data: null })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/user-reset-password', authLimiter, async (req, res) => {
  try {
    const { username, password, sign } = req.body as { username: string; password: string; sign: string }
    if (!username || !password || !isEmail(username))
      throw new Error('用户名或密码为空 | Username or password is empty')
    if (!sign || !checkUserResetPassword(sign, username))
      throw new Error('链接失效, 请重新发送 | The link is invalid, please resend.')
    const user = await getUser(username)
    if (user == null || user.status !== Status.Normal)
      throw new Error('账户状态异常 | Account status abnormal.')

    updateUserPassword(user._id.toString(), md5(password))

    res.send({ status: 'Success', message: '密码重置成功 | Password reset successful', data: null })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/user-info', auth, async (req, res) => {
  try {
    const { name, avatar, description } = req.body as UserInfo
    const userId = req.headers.userId.toString()

    const user = await getUserById(userId)
    if (user == null || user.status !== Status.Normal)
      throw new Error('用户不存在 | User does not exist.')
    await updateUserInfo(userId, { name, avatar, description } as UserInfo)
    res.send({ status: 'Success', message: '更新成功 | Update successfully' })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

// 使用兑换码后更新用户用量
router.post('/user-updateamtinfo', auth, async (req, res) => {
  try {
    const { useAmount } = req.body as { useAmount: number }
    const userId = req.headers.userId.toString()

    const user = await getUserById(userId)
    if (user == null || user.status !== Status.Normal)
      throw new Error('用户不存在 | User does not exist.')
    await updateUserAmount(userId, useAmount)
    res.send({ status: 'Success', message: '更新用量成功 | Update Amount successfully' })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

// 获取用户对话额度
router.get('/user-getamtinfo', auth, async (req, res) => {
  try {
    const userId = req.headers.userId as string
    const user = await getUserById(userId)
    const data = {
      amount: user.useAmount,
      limit: user.limit_switch,
    }
    res.send({ status: 'Success', message: null, data })
  }
  catch (error) {
    console.error(error)
    res.send({ status: 'Fail', message: 'Read Amount Error', data: 0 })
  }
})

// 兑换对话额度
router.post('/redeem-card', auth, async (req, res) => {
  try {
    const { redeemCardNo } = req.body as { redeemCardNo: string }
    const userId = req.headers.userId.toString()
    const user = await getUserById(userId)

    if (user == null || user.status !== Status.Normal)
      throw new Error('用户不存在 | User does not exist.')

    const amt_isused = await getAmtByCardNo(redeemCardNo)
    if (amt_isused) {
      if (amt_isused.redeemed === 1)
        throw new Error('该兑换码已被使用过 | RedeemCode been redeemed.')
      await updateGiftCard(redeemCardNo, userId)
      const data = amt_isused.amount
      res.send({ status: 'Success', message: '兑换成功 | Redeem successfully', data })
    }
    else {
      throw new Error('该兑换码无效，请检查是否输错 | RedeemCode not exist or Misspelled.')
    }
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

// update giftcard database
router.post('/giftcard-update', rootAuth, async (req, res) => {
  try {
    const { data, overRideSwitch } = req.body as { data: GiftCard[];overRideSwitch: boolean }
    await updateGiftCards(data, overRideSwitch)
    res.send({ status: 'Success', message: '更新成功 | Update successfully' })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/user-chat-model', auth, async (req, res) => {
  try {
    const { chatModel } = req.body as { chatModel: string }
    const userId = req.headers.userId.toString()

    const user = await getUserById(userId)
    if (user == null || user.status !== Status.Normal)
      throw new Error('用户不存在 | User does not exist.')
    await updateUserChatModel(userId, chatModel)
    res.send({ status: 'Success', message: '更新成功 | Update successfully' })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.get('/users', rootAuth, async (req, res) => {
  try {
    const page = +req.query.page
    const size = +req.query.size
    const data = await getUsers(page, size)
    res.send({ status: 'Success', message: '获取成功 | Get successfully', data })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/user-status', rootAuth, async (req, res) => {
  try {
    const { userId, status } = req.body as { userId: string; status: Status }
    const user = await getUserById(userId)
    await updateUserStatus(userId, status)
    if ((user.status === Status.PreVerify || user.status === Status.AdminVerify) && status === Status.Normal)
      await sendNoticeMail(user.email)
    res.send({ status: 'Success', message: '更新成功 | Update successfully' })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

// 函数中加入useAmount limit_switch
router.post('/user-edit', rootAuth, async (req, res) => {
  try {
    const { userId, email, password, roles, remark, useAmount, limit_switch } = req.body as { userId?: string; email: string; password: string; roles: UserRole[]; remark?: string; useAmount?: number; limit_switch?: boolean }
    if (userId) {
      await updateUser(userId, roles, password, remark, Number(useAmount), limit_switch)
    }
    else {
      const newPassword = md5(password)
      const user = await createUser(email, newPassword, roles, null, remark, Number(useAmount), limit_switch)
      await updateUserStatus(user._id.toString(), Status.Normal)
    }
    res.send({ status: 'Success', message: '更新成功 | Update successfully' })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/user-password', auth, async (req, res) => {
  try {
    let { oldPassword, newPassword, confirmPassword } = req.body as { oldPassword: string; newPassword: string; confirmPassword: string }
    if (!oldPassword || !newPassword || !confirmPassword)
      throw new Error('密码不能为空 | Password cannot be empty')
    if (newPassword !== confirmPassword)
      throw new Error('两次密码不一致 | The two passwords are inconsistent')
    if (newPassword === oldPassword)
      throw new Error('新密码不能与旧密码相同 | The new password cannot be the same as the old password')
    if (newPassword.length < 6)
      throw new Error('密码长度不能小于6位 | The password length cannot be less than 6 digits')

    const userId = req.headers.userId.toString()
    oldPassword = md5(oldPassword)
    newPassword = md5(newPassword)
    const result = await updateUserPasswordWithVerifyOld(userId, oldPassword, newPassword)
    if (result.matchedCount <= 0)
      throw new Error('旧密码错误 | Old password error')
    if (result.modifiedCount <= 0)
      throw new Error('更新失败 | Update error')
    res.send({ status: 'Success', message: '更新成功 | Update successfully' })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.get('/user-2fa', auth, async (req, res) => {
  try {
    const userId = req.headers.userId.toString()
    const user = await getUserById(userId)

    const data = new TwoFAConfig()
    if (user.secretKey) {
      data.enaled = true
    }
    else {
      const secret = speakeasy.generateSecret({ length: 20, name: `CHATGPT-WEB:${user.email}` })
      data.otpauthUrl = secret.otpauth_url
      data.enaled = false
      data.secretKey = secret.base32
      data.userName = user.email
    }
    res.send({ status: 'Success', message: '获取成功 | Get successfully', data })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/user-2fa', auth, async (req, res) => {
  try {
    const { secretKey, token } = req.body as { secretKey: string; token: string }
    const userId = req.headers.userId.toString()

    const verified = speakeasy.totp.verify({
      secret: secretKey,
      encoding: 'base32',
      token,
    })
    if (!verified)
      throw new Error('验证失败 | Verification failed')
    await updateUser2FA(userId, secretKey)
    res.send({ status: 'Success', message: '开启成功 | Enable 2FA successfully' })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/user-disable-2fa', auth, async (req, res) => {
  try {
    const { token } = req.body as { token: string }
    const userId = req.headers.userId.toString()
    const user = await getUserById(userId)
    if (!user || !user.secretKey)
      throw new Error('未开启 2FA | 2FA not enabled')
    const verified = speakeasy.totp.verify({
      secret: user.secretKey,
      encoding: 'base32',
      token,
    })
    if (!verified)
      throw new Error('验证失败 | Verification failed')
    await disableUser2FA(userId)
    res.send({ status: 'Success', message: '关闭 2FA 成功 | Disable 2FA successfully' })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/user-disable-2fa-admin', rootAuth, async (req, res) => {
  try {
    const { userId } = req.body as { userId: string }
    await disableUser2FA(userId)
    res.send({ status: 'Success', message: '关闭 2FA 成功 | Disable 2FA successfully' })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/verify', authLimiter, async (req, res) => {
  try {
    const { token } = req.body as { token: string }
    if (!token)
      throw new Error('Secret key is empty')
    const username = await checkUserVerify(token)
    const user = await getUser(username)
    if (user == null)
      throw new Error('账号不存在 | The email not exists')
    if (user.status === Status.Deleted)
      throw new Error('账号已禁用 | The email has been blocked')
    if (user.status === Status.Normal)
      throw new Error('账号已存在 | The email exists')
    if (user.status === Status.AdminVerify)
      throw new Error('请等待管理员开通 | Please wait for the admin to activate')
    if (user.status !== Status.PreVerify)
      throw new Error('账号异常 | Account abnormality')

    const config = await getCacheConfig()
    let message = '验证成功 | Verify successfully'
    if (config.siteConfig.registerReview) {
      await verifyUser(username, Status.AdminVerify)
      await sendVerifyMailAdmin(process.env.ROOT_USER, username, await getUserVerifyUrlAdmin(username))
      message = '验证成功, 请等待管理员开通 | Verify successfully, Please wait for the admin to activate'
    }
    else {
      await verifyUser(username, Status.Normal)
    }
    res.send({ status: 'Success', message, data: null })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/verifyadmin', authLimiter, async (req, res) => {
  try {
    const { token } = req.body as { token: string }
    if (!token)
      throw new Error('Secret key is empty')
    const username = await checkUserVerifyAdmin(token)
    const user = await getUser(username)
    if (user == null)
      throw new Error('账号不存在 | The email not exists')
    if (user.status !== Status.AdminVerify)
      throw new Error(`账号异常 ${user.status} | Account abnormality ${user.status}`)

    await verifyUser(username, Status.Normal)
    await sendNoticeMail(username)
    res.send({ status: 'Success', message: '账户已激活 | Account has been activated.', data: null })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/setting-base', rootAuth, async (req, res) => {
  try {
    const { apiKey, apiModel, apiBaseUrl, accessToken, timeoutMs, reverseProxy, socksProxy, socksAuth, httpsProxy } = req.body as Config

    const thisConfig = await getOriginConfig()
    thisConfig.apiKey = apiKey
    thisConfig.apiModel = apiModel
    thisConfig.apiBaseUrl = apiBaseUrl
    thisConfig.accessToken = accessToken
    thisConfig.reverseProxy = reverseProxy
    thisConfig.timeoutMs = timeoutMs
    thisConfig.socksProxy = socksProxy
    thisConfig.socksAuth = socksAuth
    thisConfig.httpsProxy = httpsProxy
    await updateConfig(thisConfig)
    clearConfigCache()
    const response = await chatConfig()
    res.send({ status: 'Success', message: '操作成功 | Successfully', data: response.data })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/setting-site', rootAuth, async (req, res) => {
  try {
    const config = req.body as SiteConfig

    const thisConfig = await getOriginConfig()
    thisConfig.siteConfig = config
    const result = await updateConfig(thisConfig)
    clearConfigCache()
    res.send({ status: 'Success', message: '操作成功 | Successfully', data: result.siteConfig })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/setting-mail', rootAuth, async (req, res) => {
  try {
    const config = req.body as MailConfig

    const thisConfig = await getOriginConfig()
    thisConfig.mailConfig = config
    const result = await updateConfig(thisConfig)
    clearConfigCache()
    res.send({ status: 'Success', message: '操作成功 | Successfully', data: result.mailConfig })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/mail-test', rootAuth, async (req, res) => {
  try {
    const config = req.body as MailConfig
    const userId = req.headers.userId as string
    const user = await getUserById(userId)
    await sendTestMail(user.email, config)
    res.send({ status: 'Success', message: '发送成功 | Successfully', data: null })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/setting-announce', rootAuth, async (req, res) => {
  try {
    const config = req.body as AnnounceConfig
    const thisConfig = await getOriginConfig()
    thisConfig.announceConfig = config
    const result = await updateConfig(thisConfig)
    clearConfigCache()
    res.send({ status: 'Success', message: '操作成功 | Successfully', data: result.announceConfig })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/announcement', async (req, res) => {
  try {
    const result = await getCacheConfig()
    res.send({ status: 'Success', message: '操作成功 | Successfully', data: result.announceConfig })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/setting-audit', rootAuth, async (req, res) => {
  try {
    const config = req.body as AuditConfig

    const thisConfig = await getOriginConfig()
    thisConfig.auditConfig = config
    const result = await updateConfig(thisConfig)
    clearConfigCache()
    if (config.enabled)
      initAuditService(config)
    res.send({ status: 'Success', message: '操作成功 | Successfully', data: result.auditConfig })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/audit-test', rootAuth, async (req, res) => {
  try {
    const { audit, text } = req.body as { audit: AuditConfig; text: string }
    const config = await getCacheConfig()
    if (audit.enabled)
      initAuditService(audit)
    const result = await containsSensitiveWords(audit, text)
    if (audit.enabled)
      initAuditService(config.auditConfig)
    res.send({ status: 'Success', message: result ? '含敏感词 | Contains sensitive words' : '不含敏感词 | Does not contain sensitive words.', data: null })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/setting-advanced', auth, async (req, res) => {
  try {
    const config = req.body as {
      systemMessage: string
      temperature: number
      top_p: number
      maxContextCount: number
      sync: boolean
    }
    if (config.sync) {
      if (!isAdmin(req.headers.userId as string)) {
        res.send({ status: 'Fail', message: '无权限 | No permission', data: null })
        return
      }
      const thisConfig = await getOriginConfig()
      thisConfig.advancedConfig = new AdvancedConfig(
        config.systemMessage,
        config.temperature,
        config.top_p,
        config.maxContextCount,
      )
      await updateConfig(thisConfig)
      clearConfigCache()
    }
    const userId = req.headers.userId.toString()
    await updateUserAdvancedConfig(userId, new AdvancedConfig(
      config.systemMessage,
      config.temperature,
      config.top_p,
      config.maxContextCount,
    ))
    res.send({ status: 'Success', message: '操作成功 | Successfully' })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/setting-reset-advanced', auth, async (req, res) => {
  try {
    const userId = req.headers.userId.toString()
    await updateUserAdvancedConfig(userId, null)
    res.send({ status: 'Success', message: '操作成功 | Successfully' })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.get('/setting-keys', rootAuth, async (req, res) => {
  try {
    const result = await getApiKeys()
    res.send({ status: 'Success', message: null, data: result })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/setting-key-status', rootAuth, async (req, res) => {
  try {
    const { id, status } = req.body as { id: string; status: Status }
    await updateApiKeyStatus(id, status)
    clearApiKeyCache()
    res.send({ status: 'Success', message: '更新成功 | Update successfully' })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/setting-key-upsert', rootAuth, async (req, res) => {
  try {
    const keyConfig = req.body as KeyConfig
    if (keyConfig._id !== undefined)
      keyConfig._id = new ObjectId(keyConfig._id)
    await upsertKey(keyConfig)
    clearApiKeyCache()
    res.send({ status: 'Success', message: '成功 | Successfully' })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/statistics/by-day', auth, async (req, res) => {
  try {
    let { userId, start, end } = req.body as { userId?: string; start: number; end: number }
    if (!userId)
      userId = req.headers.userId as string
    else if (!isAdmin(req.headers.userId as string))
      throw new Error('无权限 | No permission')

    const data = await getUserStatisticsByDay(new ObjectId(userId as string), start, end)
    res.send({ status: 'Success', message: '', data })
  }
  catch (error) {
    res.send(error)
  }
})

app.use('', chatRouter)
app.use('/api', chatRouter)

app.use('', promptRouter)
app.use('/api', promptRouter)

app.use('', uploadRouter)
app.use('/api', uploadRouter)

app.use('', router)
app.use('/api', router)

app.listen(3002, () => globalThis.console.log('Server is running on port 3002'))
