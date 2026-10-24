import 'server-only'
import { LRUCache } from 'lru-cache'

export const qlooCache = new LRUCache<string, object>({
  max: 500,
  ttl: 1000 * 60 * 60 * 24, // 24h
})
