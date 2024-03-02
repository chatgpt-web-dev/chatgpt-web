import jwt from 'jsonwebtoken'
import type { Request } from 'express'
import { getCacheConfig } from '../storage/config'
import { getUserById } from '../storage/mongo'
import { Status } from '../storage/model'
import type { AuthJwtPayload } from '../types'

async function auth(req, res, next) {
  const config = await getCacheConfig()
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
    // no Authorization info is received withput login
    if (!(req.header('Authorization') as string))
      return null // '6406d8c50aedd633885fa16f'
    token = req.header('Authorization').replace('Bearer ', '')
    const config = await getCacheConfig()
    const info = jwt.verify(token, config.siteConfig.loginSalt.trim()) as AuthJwtPayload
    return info.userId
  }
  catch (error) {
    globalThis.console.error(`auth middleware getUserId err from token ${token} `, error.message)
  }
  return null
}

export { auth, getUserId }
