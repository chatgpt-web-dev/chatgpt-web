import type { RequestHandler } from 'express'
import type { Options } from 'express-rate-limit'
import * as process from 'node:process'
import * as dotenv from 'dotenv'
import { rateLimit } from 'express-rate-limit'
import requestIp from 'request-ip'
import { isNotEmptyString } from '../utils/is'

dotenv.config()

const MAX_REQUEST_PER_HOUR = process.env.MAX_REQUEST_PER_HOUR
const AUTH_MAX_REQUEST_PER_MINUTE = process.env.AUTH_MAX_REQUEST_PER_MINUTE

function parsePositiveInt(value?: string | null): number | null {
  if (!isNotEmptyString(value)) {
    return null
  }

  const parsedValue = Number.parseInt(value, 10)

  return Number.isNaN(parsedValue) || parsedValue <= 0 ? null : parsedValue
}

const noopLimiter: RequestHandler = (_req, _res, next) => {
  next()
}

type LimiterOptions = Partial<Omit<Options, 'limit' | 'max'>>

function buildLimiter(
  count: number | null,
  options: LimiterOptions,
): RequestHandler {
  if (!count) {
    return noopLimiter
  }

  return rateLimit({
    ...options,
    limit: count,
  })
}

const limiter = buildLimiter(parsePositiveInt(MAX_REQUEST_PER_HOUR), {
  windowMs: 60 * 60 * 1000, // Maximum number of accesses within an hour
  statusCode: 200, // 200 means success，but the message is 'Too many request from this IP in 1 hour'
  keyGenerator: (req, _) => {
    return requestIp.getClientIp(req) // IP address from requestIp.mw(), as opposed to req.ip
  },
  message: async (req, res) => {
    res.send({ status: 'Fail', message: 'Too many request from this IP in 1 hour', data: null })
  },
})

const authLimiter = buildLimiter(parsePositiveInt(AUTH_MAX_REQUEST_PER_MINUTE), {
  windowMs: 60 * 1000, // Maximum number of accesses within a minute
  statusCode: 200, // 200 means success，but the message is 'Too many request from this IP in 1 minute'
  keyGenerator: (req, _) => {
    return requestIp.getClientIp(req) // IP address from requestIp.mw(), as opposed to req.ip
  },
  message: async (req, res) => {
    res.send({ status: 'Fail', message: 'About Auth limiter, Too many request from this IP in 1 minute', data: null })
  },
})

export { authLimiter, limiter }
