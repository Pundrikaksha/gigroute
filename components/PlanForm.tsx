'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const inputClass =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 placeholder:text-zinc-500 hover:border-zinc-500'

export default function PlanForm() {
  const [artist, setArtist] = useState('')
  const [region, setRegion] = useState('')
  const [cities, setCities] = useState('')
  const [stops, setStops] = useState('5')
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const query = new URLSearchParams({ artist: artist.trim(), stops })
    if (region.trim()) query.set('region', region.trim())
    if (cities.trim()) query.set('cities', cities.trim())
    router.push(`/plan?${query}`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" aria-describedby="form-note">
      <div>
        <label htmlFor="artist" className="mb-1 block text-sm font-medium text-zinc-200">
          Artist or &ldquo;sounds like&rdquo; <span aria-hidden="true" className="text-amber-300">*</span>
        </label>
        <input
          id="artist"
          name="artist"
          type="text"
          required
          maxLength={100}
          autoComplete="off"
          placeholder="e.g. Big Thief"
          aria-describedby="artist-help"
          className={inputClass}
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
        />
        <p id="artist-help" className="mt-1 text-xs text-zinc-400">
          Your band, or a better-known artist your audience also loves.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div>
          <label htmlFor="region" className="mb-1 block text-sm font-medium text-zinc-200">
            Region or country
          </label>
          <input
            id="region"
            name="region"
            type="text"
            maxLength={100}
            placeholder="e.g. UK"
            className={inputClass}
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="stops" className="mb-1 block text-sm font-medium text-zinc-200">
            Stops
          </label>
          <select id="stops" name="stops" className={inputClass} value={stops} onChange={(e) => setStops(e.target.value)}>
            {[2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="cities" className="mb-1 block text-sm font-medium text-zinc-200">
          Candidate cities <span className="font-normal text-zinc-400">(optional)</span>
        </label>
        <input
          id="cities"
          name="cities"
          type="text"
          placeholder="e.g. Austin, Seattle"
          aria-describedby="cities-help"
          className={inputClass}
          value={cities}
          onChange={(e) => setCities(e.target.value)}
        />
        <p id="cities-help" className="mt-1 text-xs text-zinc-400">
          Comma-separated. Leave blank to let Qloo pick the strongest cities.
        </p>
      </div>
      <button
        type="submit"
        className="w-full rounded-lg bg-amber-400 px-4 py-2.5 font-semibold text-zinc-950 hover:bg-amber-300"
      >
        Plan my tour
      </button>
      <p id="form-note" className="text-xs text-zinc-400">
        Only the artist name and place names are sent to Qloo. No personal data.
      </p>
    </form>
  )
}
