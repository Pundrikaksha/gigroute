import 'server-only'
import type { ChatCompletionFunctionTool } from 'openai/resources/chat/completions'
import { getQlooClient } from '../qloo'

const qloo = getQlooClient()

export interface ToolArgs {
  artist_name?: string
  entity_ids?: string[]
  region?: string
  city?: string
  type?: string
  stops?: string[]
  venue_name?: string
  why?: string
}

export const tools: ChatCompletionFunctionTool[] = [
  {
    type: 'function',
    function: {
      name: 'resolve_artist',
      description: 'Resolve an artist name to Qloo entity IDs.',
      parameters: {
        type: 'object',
        properties: {
          artist_name: { type: 'string' },
        },
        required: ['artist_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'similar_artists',
      description: 'Find similar artists for local co-bills.',
      parameters: {
        type: 'object',
        properties: {
          entity_ids: { type: 'array', items: { type: 'string' } },
        },
        required: ['entity_ids'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fan_hotspots',
      description: 'Find cities/areas where fans of this taste concentrate.',
      parameters: {
        type: 'object',
        properties: {
          entity_ids: { type: 'array', items: { type: 'string' } },
          region: { type: 'string' },
        },
        required: ['entity_ids'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'venues_in_city',
      description: 'Rank venues/bars/record shops in a city whose audience overlaps the taste.',
      parameters: {
        type: 'object',
        properties: {
          entity_ids: { type: 'array', items: { type: 'string' } },
          city: { type: 'string' },
        },
        required: ['entity_ids', 'city'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cross_domain_tastes',
      description: 'Find cross-domain tastes (brands, movies) for merch/poster ideas.',
      parameters: {
        type: 'object',
        properties: {
          entity_ids: { type: 'array', items: { type: 'string' } },
          type: { type: 'string', enum: ['brand', 'movie'] },
        },
        required: ['entity_ids', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'plan_route',
      description: 'Order the stops into a route (nearest-neighbour on lat/long).',
      parameters: {
        type: 'object',
        properties: {
          stops: { type: 'array', items: { type: 'string' }, description: "Array of city names with lat/long info." },
        },
        required: ['stops'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'draft_pitch',
      description: 'Draft a short pitch email for a venue.',
      parameters: {
        type: 'object',
        properties: {
          venue_name: { type: 'string' },
          artist_name: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['venue_name', 'artist_name'],
      },
    },
  },
]

export async function executeTool(name: string, args: ToolArgs) {
  const entityIds = args.entity_ids ?? []
  switch (name) {
    case 'resolve_artist': {
      const artistName = args.artist_name ?? ''
      const artists = await qloo.search(artistName, ['urn:entity:artist'])
      if (artists.length > 1 && artists[0].name.toLowerCase() !== artistName.toLowerCase()) {
        return { needs_input: true, candidates: artists.slice(0, 3) }
      }
      return artists.length > 0 ? [artists[0]] : []
    }
    case 'similar_artists':
      return await qloo.similarArtists(entityIds)
    case 'fan_hotspots':
      return await qloo.fanHotspots(entityIds, args.region)
    case 'venues_in_city':
      return await qloo.venuesInCity(entityIds, args.city ?? '')
    case 'cross_domain_tastes':
      return await qloo.crossDomain(entityIds, args.type ?? 'brand')
    case 'plan_route':
      // Basic nearest neighbor sorting mockup, assuming we get real lat/lng in a real scenario
      // For mock, just return the stops in order they came or random sort
      return args.stops ?? []
    case 'draft_pitch':
      return `Hi ${args.venue_name} booking team, I represent ${args.artist_name}. We noticed our audience overlaps significantly with your typical crowd (${args.why || 'great venue'}). We'd love to discuss a potential date.`
    default:
      throw new Error(`Unknown tool: ${name}`)
  }
}
