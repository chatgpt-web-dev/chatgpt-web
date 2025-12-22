import type { AnnounceConfig, AuditConfig, Config, GiftCard, KeyConfig, MailConfig, SearchResult, SiteConfig, UserInfo } from './storage/model'
import type { AuthJwtPayload } from './types'
import * as path from 'node:path'
import * as process from 'node:process'
import * as dotenv from 'dotenv'
import express from 'express'
import jwt from 'jsonwebtoken'
import { ObjectId } from 'mongodb'
import speakeasy from 'speakeasy'
import { chatConfig, containsSensitiveWords, initAuditService } from './chatgpt'
import { auth, getUserId } from './middleware/auth'
import { authLimiter } from './middleware/limiter'
import { isAdmin, rootAuth } from './middleware/rootAuth'
import { router as chatRouter } from './routes/chat'
import { router as promptRouter } from './routes/prompt'
import { router as roomRouter } from './routes/room'
import { router as uploadRouter } from './routes/upload'
import { clearApiKeyCache, clearConfigCache, getApiKeys, getCacheApiKeys, getCacheConfig, getOriginConfig } from './storage/config'
import { AdvancedConfig, Status, UserConfig, UserRole } from './storage/model'
import {
  createUser,
  disableUser2FA,
  getAmtByCardNo,
  getUser,
  getUserById,
  getUsers,
  getUserStatisticsByDay,
  initializeMongoDB,
  updateApiKeyStatus,
  updateConfig,
  updateGiftCard,
  updateGiftCards,
  updateUser,
  updateUser2FA,
  updateUserAdvancedConfig,
  updateUserAmount,
  updateUserChatModel,
  updateUserInfo,
  updateUserMaxContextCount,
  updateUserPassword,
  updateUserPasswordWithVerifyOld,
  updateUserStatus,
  upsertKey,
  verifyUser,
} from './storage/mongo'
import { TwoFAConfig } from './types'
import { hasAnyRole, isEmail, isNotEmptyString } from './utils/is'
import { sendNoticeMail, sendResetPasswordMail, sendTestMail, sendVerifyMail, sendVerifyMailAdmin } from './utils/mail'
import { checkUserResetPassword, checkUserVerify, checkUserVerifyAdmin, getUserResetPasswordUrl, getUserVerifyUrl, getUserVerifyUrlAdmin, md5 } from './utils/security'

dotenv.config({ quiet: true })

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

app.use(express.json({
  limit: '100mb',
}))

app.use('/uploads', express.static('uploads'))

app.all('/', (_, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'authorization, Content-Type')
  res.header('Access-Control-Allow-Methods', '*')
  next()
})

router.post('/user-register', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body as { username: string, password: string }
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
    const userId = await getUserId(req)
    const chatModels: {
      label: string
      key: string
      value: string
    }[] = []

    const chatModelOptions = config.siteConfig.chatModels.split(',').map((model: string) => {
      return {
        label: model,
        key: model,
        value: model,
      }
    })

    let userInfo: { name: string, description: string, avatar: string, userId: string, root: boolean, roles: UserRole[], config: UserConfig, advanced: AdvancedConfig }
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
            title: config.siteConfig.siteTitle,
            chatModels,
            allChatModels: chatModelOptions,
            showWatermark: config.siteConfig?.showWatermark,
            adminViewChatHistoryEnabled: process.env.ADMIN_VIEW_CHAT_HISTORY_ENABLED === 'true',
          },
        })
        return
      }

      if (!user?.config) {
        user.config = new UserConfig()
      }
      if (!user.config?.chatModel) {
        user.config.chatModel = config?.siteConfig?.chatModels.split(',')[0]
      }
      if (user.config?.maxContextCount === undefined) {
        user.config.maxContextCount = 10
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

      // 为每个 key 和模型的组合生成不同的选项
      const modelKeyMap = new Map<string, Array<{ keyId: string, toolsEnabled: boolean, imageUploadEnabled: boolean, modelAlias?: string }>>()
      chatModelOptions.forEach((chatModel) => {
        keys.forEach((key) => {
          if (key.chatModel === chatModel.value) {
            const keyId = key._id.toString()
            if (!modelKeyMap.has(chatModel.value)) {
              modelKeyMap.set(chatModel.value, [])
            }
            const configs = modelKeyMap.get(chatModel.value)!
            configs.push({
              keyId,
              toolsEnabled: key.toolsEnabled || false,
              imageUploadEnabled: key.imageUploadEnabled || false,
              modelAlias: key.modelAlias,
            })
          }
        })
      })

      // 为每个配置组合生成唯一的选项
      modelKeyMap.forEach((configs, modelValue) => {
        const thisChatModel = chatModelOptions.find(d => d.value === modelValue)
        if (!thisChatModel)
          return

        // 按照功能分组（toolsEnabled 和 imageUploadEnabled）
        const configGroups = new Map<string, typeof configs>()
        configs.forEach((config) => {
          const groupKey = `${config.toolsEnabled}-${config.imageUploadEnabled}`
          if (!configGroups.has(groupKey)) {
            configGroups.set(groupKey, [])
          }
          configGroups.get(groupKey)!.push(config)
        })

        // 为每个功能组生成选项
        configGroups.forEach((groupConfigs) => {
          const config = groupConfigs[0] // 取第一个作为代表
          const suffix = []
          if (config.toolsEnabled) {
            suffix.push('Tools')
          }
          if (config.imageUploadEnabled) {
            suffix.push('Image')
          }

          // 使用模型别名或默认标签
          const displayModalName = config.modelAlias || thisChatModel.label

          // 构建选项
          if (suffix.length === 0 && groupConfigs.length > 0) {
            chatModels.push({
              label: `${displayModalName}`,
              key: modelValue,
              value: modelValue,
            })
          }
          else {
            // 需要key来判断用走特殊逻辑
            chatModels.push({
              label: `${displayModalName}`,
              key: `${modelValue}|${config.keyId}`,
              value: `${modelValue}|${config.keyId}`,
            })
          }
        })
      })

      res.send({
        status: 'Success',
        message: '',
        data: {
          auth: hasAuth,
          authProxyEnabled,
          allowRegister,
          title: config.siteConfig.siteTitle,
          chatModels,
          allChatModels: chatModelOptions,
          usageCountLimit: config.siteConfig?.usageCountLimit,
          showWatermark: config.siteConfig?.showWatermark,
          adminViewChatHistoryEnabled: process.env.ADMIN_VIEW_CHAT_HISTORY_ENABLED === 'true',
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
        title: config.siteConfig.siteTitle,
        chatModels: chatModelOptions,
        allChatModels: chatModelOptions,
        showWatermark: config.siteConfig?.showWatermark,
        adminViewChatHistoryEnabled: process.env.ADMIN_VIEW_CHAT_HISTORY_ENABLED === 'true',
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
    const { username, password, token } = req.body as { username: string, password: string, token?: string }
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
    const { username, password, sign } = req.body as { username: string, password: string, sign: string }
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
    const { data, overRideSwitch } = req.body as { data: GiftCard[], overRideSwitch: boolean }
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

router.post('/user-max-context-count', auth, async (req, res) => {
  try {
    const { maxContextCount } = req.body as { maxContextCount: number }
    const userId = req.headers.userId.toString()

    const user = await getUserById(userId)
    if (user == null || user.status !== Status.Normal)
      throw new Error('用户不存在 | User does not exist.')
    await updateUserMaxContextCount(userId, maxContextCount)
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
    const search = req.query.search as string | undefined
    const data = await getUsers(page, size, search)
    res.send({ status: 'Success', message: '获取成功 | Get successfully', data })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/user-status', rootAuth, async (req, res) => {
  try {
    const { userId, status } = req.body as { userId: string, status: Status }
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
    const { userId, email, password, roles, remark, useAmount, limit_switch } = req.body as { userId?: string, email: string, password: string, roles: UserRole[], remark?: string, useAmount?: number, limit_switch?: boolean }
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
    let { oldPassword, newPassword, confirmPassword } = req.body as { oldPassword: string, newPassword: string, confirmPassword: string }
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
    const { secretKey, token } = req.body as { secretKey: string, token: string }
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
    const { apiKey, apiBaseUrl, accessToken, timeoutMs, reverseProxy, socksProxy, socksAuth, httpsProxy } = req.body as Config

    const thisConfig = await getOriginConfig()
    thisConfig.apiKey = apiKey
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
    const { audit, text } = req.body as { audit: AuditConfig, text: string }
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

router.post('/setting-search', rootAuth, async (req, res) => {
  try {
    const config = req.body as import('./storage/model').SearchConfig

    const thisConfig = await getOriginConfig()
    thisConfig.searchConfig = config
    const result = await updateConfig(thisConfig)
    clearConfigCache()
    res.send({ status: 'Success', message: '操作成功 | Successfully', data: result.searchConfig })
  }
  catch (error) {
    res.send({ status: 'Fail', message: error.message, data: null })
  }
})

router.post('/search-test', rootAuth, async (req, res) => {
  try {
    const { search, text } = req.body as { search: import('./storage/model').SearchConfig, text: string }

    // Validate search configuration
    if (!search.enabled) {
      res.send({ status: 'Fail', message: '搜索功能未启用 | Search functionality is not enabled', data: null })
      return
    }

    if (!search.options?.apiKey) {
      res.send({ status: 'Fail', message: '搜索 API 密钥未配置 | Search API key is not configured', data: null })
      return
    }

    if (!text || text.trim() === '') {
      res.send({ status: 'Fail', message: '搜索文本不能为空 | Search text cannot be empty', data: null })
      return
    }

    // Validate maxResults range
    const maxResults = search.options?.maxResults || 10
    if (maxResults < 1 || maxResults > 20) {
      res.send({ status: 'Fail', message: '最大搜索结果数必须在 1-20 之间 | Max search results must be between 1-20', data: null })
      return
    }

    // Import required modules
    const { tavily } = await import('@tavily/core')

    // Execute search
    const tvly = tavily({ apiKey: search.options.apiKey })
    const response = await tvly.search(
      text.trim(),
      {
        searchDepth: 'advanced',
        chunksPerSource: 3,
        includeRawContent: search.options?.includeRawContent ? 'markdown' : false,
        maxResults,
        timeout: 120,
      },
    )

    const searchResults = response.results as SearchResult[]
    const searchUsageTime = response.responseTime

    // Return search results
    res.send({
      status: 'Success',
      message: `搜索测试成功 | Search test successful (用时 ${searchUsageTime}ms, 找到 ${searchResults.length} 个结果)`,
      data: {
        query: text.trim(),
        results: searchResults,
        usageTime: searchUsageTime,
        resultCount: searchResults.length,
        maxResults,
      },
    })
  }
  catch (error: any) {
    console.error('Search test error:', error)
    res.send({ status: 'Fail', message: `搜索测试失败 | Search test failed: ${error.message}`, data: null })
  }
})

router.post('/setting-advanced', auth, async (req, res) => {
  try {
    const config = req.body as {
      systemMessage: string
      temperature: number
      top_p: number
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
      )
      await updateConfig(thisConfig)
      clearConfigCache()
    }
    const userId = req.headers.userId.toString()
    await updateUserAdvancedConfig(userId, new AdvancedConfig(
      config.systemMessage,
      config.temperature,
      config.top_p,
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
    const { id, status } = req.body as { id: string, status: Status }
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
    let { userId, start, end } = req.body as { userId?: string, start: number, end: number }
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

app.use('', roomRouter)
app.use('/api', roomRouter)

app.use('', uploadRouter)
app.use('/api', uploadRouter)

app.use('', router)
app.use('/api', router)

// Initialize MongoDB connection and indexes on startup
initializeMongoDB().catch((error) => {
  console.error('Failed to initialize MongoDB:', error)
  // Continue startup even if initialization fails
  // MongoDB operations will fail gracefully if connection is not established
})

app.listen(3002, () => globalThis.console.log('Server is running on port 3002'))
