import type { JwtPayload } from 'jsonwebtoken'

export interface ImageGenerationTool {
  type: 'image_generation'
  input_fidelity?: 'low' | 'medium' | 'high'
  quality?: 'low' | 'medium' | 'high'
  model?: 'gpt-image-1' | 'gpt-image-1.5'
}

export interface RequestProps {
  roomId: number
  uuid: number
  regenerate: boolean
  prompt: string
  uploadFileKeys?: string[]
  options?: ChatContext
  systemMessage: string
  tools?: ImageGenerationTool[]
  previousResponseId?: string
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
