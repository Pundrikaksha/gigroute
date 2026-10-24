import { RealQlooClient } from '../lib/qloo/real'

async function checkContract() {
  if (!process.env.QLOO_API_KEY) {
    console.log("No QLOO_API_KEY set. Skipping contract check.")
    return
  }

  console.log("Starting Qloo API contract check...\n")
  const client = new RealQlooClient()

  const safePrint = (name: string, res: object) => {
    console.log(`--- ${name} ---`)
    if (Array.isArray(res)) {
      console.log(`Status: OK`)
      console.log(`Count: ${res.length}`)
      if (res.length > 0) {
        console.log(`Keys: ${Object.keys(res[0]).join(', ')}`)
      }
    } else {
      console.log(`Status: OK`)
      console.log(`Keys: ${Object.keys(res).join(', ')}`)
    }
    console.log()
  }

  try {
    const searchRes = await client.search('Radiohead', ['urn:entity:artist'])
    safePrint('search', searchRes)

    // Using a mocked ID for the contract check to avoid a prior dependent call.
    // In reality, this requires a valid ID. We'll use one if search succeeds, else mock.
    const artistId = searchRes.length > 0 ? searchRes[0].id : 'urn:entity:artist:mock'

    const similarRes = await client.similarArtists([artistId], 2)
    safePrint('similarArtists', similarRes)

    const hotspotsRes = await client.fanHotspots([artistId], 'UK')
    safePrint('fanHotspots', hotspotsRes)

    const venuesRes = await client.venuesInCity([artistId], 'London', 2)
    safePrint('venuesInCity', venuesRes)

    console.log(`venuesInCity explainability present: ${venuesRes.some((v) => v.explainability.length > 0)}\n`)

    const crossDomainRes = await client.crossDomain([artistId], 'brand')
    safePrint('crossDomain', crossDomainRes)

    const tagsRes = await client.findTags('indie', 'urn:entity:artist')
    safePrint('findTags', tagsRes)

    console.log("Contract check completed successfully.")
  } catch (error) {
    console.error("Contract check failed:", error instanceof Error ? error.message : error)
  }
}

checkContract()
