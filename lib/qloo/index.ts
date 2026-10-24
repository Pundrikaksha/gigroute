import 'server-only'
import { QlooClient } from './types'
import { MockQlooClient } from './mock'
import { RealQlooClient } from './real'

export function getQlooClient(): QlooClient {
  const isMock = process.env.QLOO_MOCK === '1' || !process.env.QLOO_API_KEY
  if (isMock) {
    return new MockQlooClient()
  }
  return new RealQlooClient()
}

export * from './types'
