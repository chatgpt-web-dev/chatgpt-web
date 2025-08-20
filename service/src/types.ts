import type { JwtPayload } from 'jsonwebtoken'

export interface RequestProps {
  roomId: number
  uuid: number
  regenerate: boolean
  prompt: string
  uploadFileKeys?: string[]
  options?: ChatContext
  systemMessage: string
  temperature?: number
  top_p?: number
}

export interface ChatContext {
  conversationId?: string
  parentMessageId?: string
}

export interface AuthJwtPayload extends JwtPayload {
  name: string
  avatar: string
  description: string
  userId: string
  root: boolean
  config: any
}

export class TwoFAConfig {
  enaled: boolean
  userName: string
  secretKey: string
  otpauthUrl: string
  constructor() {
    this.enaled = false
    this.userName = ''
    this.secretKey = ''
    this.otpauthUrl = ''
  }
}
