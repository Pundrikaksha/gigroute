import 'server-only'
import { QlooClient } from './types'
import { MockQlooClient } from './mock'
import { RealQlooClient } from './real'

export function isQlooMock(): boolean {
  return process.env.QLOO_MOCK === '1' || !process.env.QLOO_API_KEY
}

export function getQlooClient(options: { forceMock?: boolean } = {}): QlooClient {
  if (options.forceMock || isQlooMock()) {
    return new MockQlooClient()
  }
  return new RealQlooClient()
}

export * from './types'
