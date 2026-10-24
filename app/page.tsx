'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [artist, setArtist] = useState('')
  const [region, setRegion] = useState('')
  const [cities, setCities] = useState('')
  const [stops, setStops] = useState(6)
  const router = useRouter()

  const handleSample = () => {
    const query = new URLSearchParams({
      artist: 'Radiohead',
      region: 'UK',
      stops: '6'
    }).toString()
    router.push(`/plan?${query}`)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const query = new URLSearchParams({
      artist,
      region,
      cities,
      stops: stops.toString()
    }).toString()
    router.push(`/plan?${query}`)
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gray-900 text-white">
      <h1 className="text-4xl font-bold mb-4">GigRoute</h1>
      <p className="text-xl mb-8 text-gray-300">A taste-grounded tour planner for independent musicians.</p>

      <form onSubmit={handleSubmit} className="w-full max-w-md space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Artist Name or &ldquo;Sounds Like&rdquo;</label>
          <input
            type="text"
            className="w-full p-2 rounded bg-gray-800 border border-gray-700 focus:outline-none focus:border-blue-500"
            value={artist}
            onChange={e => setArtist(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Region/Country</label>
          <input
            type="text"
            className="w-full p-2 rounded bg-gray-800 border border-gray-700 focus:outline-none focus:border-blue-500"
            value={region}
            onChange={e => setRegion(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Candidate Cities (Optional)</label>
          <input
            type="text"
            className="w-full p-2 rounded bg-gray-800 border border-gray-700 focus:outline-none focus:border-blue-500"
            value={cities}
            onChange={e => setCities(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Stop Count (Default 6)</label>
          <input
            type="number"
            className="w-full p-2 rounded bg-gray-800 border border-gray-700 focus:outline-none focus:border-blue-500"
            value={stops}
            onChange={e => setStops(parseInt(e.target.value))}
            min={1}
            max={20}
          />
        </div>
        <div className="flex gap-4 pt-4">
          <button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-700 py-2 rounded font-semibold transition-colors">
            Plan Tour
          </button>
          <button type="button" onClick={handleSample} className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded font-semibold transition-colors">
            Try sample
          </button>
        </div>
      </form>
    </main>
  )
}
