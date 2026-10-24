import { expect, test, describe, vi } from 'vitest'
import { RealQlooClient } from '../lib/qloo/real'

// fetchWithRetry is private; stub it so no network request is ever made.
function stubFetch(client: RealQlooClient) {
  const target = client as unknown as {
    fetchWithRetry: (path: string, options: RequestInit) => Promise<Response>
  }
  return vi.spyOn(target, 'fetchWithRetry').mockResolvedValue({
    json: async () => ({ items: [] })
  } as Response)
}

describe('Qloo Param Builder', () => {
  test('similarArtists params', async () => {
    const client = new RealQlooClient()
    const fetchSpy = stubFetch(client)

    await client.similarArtists(['id1'])
    expect(fetchSpy).toHaveBeenCalledWith(
      '/v2/insights?filter.type=urn%3Aentity%3Aartist&signal.interests.entities=id1&paging.take=6',
      {}
    )
  })

  test('fanHotspots params', async () => {
    const client = new RealQlooClient()
    const fetchSpy = stubFetch(client)

    await client.fanHotspots(['id1'], 'UK')
    expect(fetchSpy).toHaveBeenCalledWith(
      '/v2/insights?filter.type=urn%3Aentity%3Adestination&signal.interests.entities=id1&paging.take=10&filter.location.query=UK',
      {}
    )
  })

  test('venuesInCity params', async () => {
    const client = new RealQlooClient()
    const fetchSpy = stubFetch(client)

    await client.venuesInCity(['id1'], 'Chicago')
    expect(fetchSpy).toHaveBeenCalledWith(
      '/v2/insights?filter.type=urn%3Aentity%3Aplace&filter.location.query=Chicago&signal.interests.entities=id1&feature.explainability=true&paging.take=5',
      {}
    )
  })

  test('crossDomain params', async () => {
    const client = new RealQlooClient()
    const fetchSpy = stubFetch(client)

    await client.crossDomain(['id1'], 'brand')
    expect(fetchSpy).toHaveBeenCalledWith(
      '/v2/insights?filter.type=urn%3Aentity%3Abrand&signal.interests.entities=id1&paging.take=5',
      {}
    )
  })
})
