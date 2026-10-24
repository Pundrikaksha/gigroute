'use client'

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

// Fix for default icon in react-leaflet
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
})

export interface Venue {
  name: string
  affinity?: number
  why?: string
}

export interface Stop {
  name: string
  lat?: number
  lng?: number
  why?: string
  venues?: Venue[]
  coBills?: string[]
  merch?: string[]
}

export default function Map({ stops }: { stops: Stop[] }) {
  if (stops.length === 0) return null

  const center = stops[0]

  return (
    <MapContainer center={[center.lat || 51.505, center.lng || -0.09]} zoom={6} className="h-full w-full rounded-lg shadow-lg">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {stops.map((stop, i) => (
        stop.lat != null && stop.lng != null ? (
          <Marker key={i} position={[stop.lat, stop.lng]}>
            <Popup>
              <strong>{i + 1}. {stop.name}</strong>
            </Popup>
          </Marker>
        ) : null
      ))}
    </MapContainer>
  )
}
