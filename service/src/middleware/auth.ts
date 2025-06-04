import type { Request } from 'express'
import type { AuthJwtPayload } from '../types'
import * as process from 'node:process'
import jwt from 'jsonwebtoken'
import { authProxyHeaderName, getCacheConfig } from '../storage/config'
import { Status, UserRole } from '../storage/model'
import { createUser, getUser, getUserById } from '../storage/mongo'

async function auth(req, res, next) {
  const config = await getCacheConfig()

  if (config.siteConfig.authProxyEnabled) {
    try {
      const username = req.header(authProxyHeaderName)
      if (!username) {
        res.send({ status: 'Unauthorized', message: `Please config auth proxy (usually is nginx) add set proxy header ${authProxyHeaderName}.`, data: null })
        return
      }
      const user = await getUser(username)
      req.headers.userId = user._id.toString()
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
      if (user == null || user.status !== Status.Normal)
        throw new Error('用户不存在 | User does not exist.')
      else
        next()
    }
    catch (error) {
      res.send({ status: 'Unauthorized', message: error.message ?? 'Please authenticate.', data: null })
    }
  }
  else {
    // fake userid
    req.headers.userId = '6406d8c50aedd633885fa16f'
    next()
  }
}

async function getUserId(req: Request): Promise<string | undefined> {
  let token: string
  try {
    const config = await getCacheConfig()
    if (config.siteConfig.authProxyEnabled) {
      const username = req.header(authProxyHeaderName)
      if (!username) {
        globalThis.console.error(`Please config auth proxy (usually is nginx) add set proxy header ${authProxyHeaderName}.`)
        return null
      }
      let user = await getUser(username)
      if (user == null) {
        const isRoot = username.toLowerCase() === process.env.ROOT_USER
        user = await createUser(username, '', isRoot ? [UserRole.Admin] : [UserRole.User], Status.Normal, 'Created by auth proxy.')
      }
      return user._id.toString()
    }

    // no Authorization info is received without login
    if (!(req.header('Authorization') as string))
      return null // '6406d8c50aedd633885fa16f'
    token = req.header('Authorization').replace('Bearer ', '')

    const info = jwt.verify(token, config.siteConfig.loginSalt.trim()) as AuthJwtPayload
    return info.userId
  }
  catch (error) {
    globalThis.console.error(`auth middleware getUserId err from token ${token} `, error.message)
  }
  return null
}

export { auth, getUserId }
