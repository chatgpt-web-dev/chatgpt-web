import type { AuthJwtPayload } from '../types'
import * as dotenv from 'dotenv'
import jwt from 'jsonwebtoken'
import { authProxyHeaderName, getCacheConfig } from '../storage/config'
import { Status, UserRole } from '../storage/model'
import { getUser, getUserById } from '../storage/mongo'

dotenv.config()

async function rootAuth(req, res, next) {
  const config = await getCacheConfig()

  if (config.siteConfig.authProxyEnabled) {
    try {
      const username = req.header(authProxyHeaderName)
      const user = await getUser(username)
      req.headers.userId = user._id
      if (user == null || user.status !== Status.Normal || !user.roles.includes(UserRole.Admin))
        res.send({ status: 'Fail', message: '无权限 | No permission.', data: null })
      else
        next()
    }
    catch (error) {
      res.send({ status: 'Unauthorized', message: error.message ?? `Please config auth proxy (usually is nginx) add set proxy header ${authProxyHeaderName}.`, data: null })
    }
    return
  }

  if (config.siteConfig.loginEnabled) {
    try {
      const token = req.header('Authorization').replace('Bearer ', '')
      const info = jwt.verify(token, config.siteConfig.loginSalt.trim()) as AuthJwtPayload
      req.headers.userId = info.userId
      const user = await getUserById(info.userId)
      if (user == null || user.status !== Status.Normal || !user.roles.includes(UserRole.Admin))
        res.send({ status: 'Fail', message: '无权限 | No permission.', data: null })
      else
        next()
    }
    catch (error) {
      res.send({ status: 'Unauthorized', message: error.message ?? 'Please authenticate.', data: null })
    }
  }
  else {
    res.send({ status: 'Fail', message: '无权限 | No permission.', data: null })
  }
}

async function isAdmin(userId: string) {
  const user = await getUserById(userId)
  return user != null && user.status === Status.Normal && user.roles.includes(UserRole.Admin)
}

export { isAdmin, rootAuth }
