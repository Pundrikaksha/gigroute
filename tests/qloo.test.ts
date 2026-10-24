import { expect, test, describe } from 'vitest'
import { MockQlooClient } from '../lib/qloo/mock'

describe('MockQlooClient', () => {
  const client = new MockQlooClient()

  test('search finds Radiohead', async () => {
    const res = await client.search('Radiohead')
    expect(res.length).toBeGreaterThan(0)
    expect(res[0].name).toBe('Radiohead')
  })

  test('similarArtists returns entities', async () => {
    const res = await client.similarArtists(['urn:entity:artist:mock-radiohead'])
    expect(res.length).toBeGreaterThan(0)
    expect(res[0].name).toBe('Thom Yorke')
  })

  test('fanHotspots filters by region optionally', async () => {
    const res = await client.fanHotspots(['urn:entity:artist:mock-radiohead'])
    expect(res.length).toBeGreaterThan(0)
    
    const ukRes = await client.fanHotspots(['urn:entity:artist:mock-radiohead'], 'UK')
    expect(ukRes.every(r => r.name.includes('UK'))).toBe(true)
  })

  test('venuesInCity returns venues for known city', async () => {
    const res = await client.venuesInCity(['urn:entity:artist:mock-radiohead'], 'London, UK')
    expect(res.length).toBeGreaterThan(0)
    expect(res[0].type).toBe('urn:entity:place')
  })

  test('crossDomain returns movies or brands', async () => {
    const brands = await client.crossDomain(['urn:entity:artist:mock-radiohead'], 'brand')
    expect(brands.length).toBeGreaterThan(0)
    expect(brands[0].type).toBe('urn:entity:brand')
  })
})
