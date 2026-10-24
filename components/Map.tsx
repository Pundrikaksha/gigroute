'use client'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'

export interface MapStop {
  city: string
  lat?: number
  lng?: number
  affinity?: number
}

type Located = MapStop & { lat: number; lng: number }

const markerIcon = (n: number) =>
  L.divIcon({
    className: '',
    html: `<span class="gr-marker">${n}</span>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  })

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  const key = JSON.stringify(points)
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 8)
    else if (points.length > 1) map.fitBounds(points, { padding: [40, 40] })
    // `key` captures the coordinates; re-fit only when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key])
  return null
}

export default function Map({ stops, routed }: { stops: MapStop[]; routed: boolean }) {
  const located = stops
    .map((s, i) => ({ ...s, n: i + 1 }))
    .filter((s): s is Located & { n: number } => s.lat != null && s.lng != null)
  const points = located.map((s) => [s.lat, s.lng] as [number, number])

  return (
    <MapContainer center={points[0] ?? [51.5, -0.12]} zoom={5} scrollWheelZoom={false} className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} />
      {routed && points.length > 1 && (
        <Polyline positions={points} pathOptions={{ color: '#fbbf24', weight: 3, dashArray: '6 8' }} />
      )}
      {located.map((s) => (
        <Marker key={`${s.city}-${s.n}`} position={[s.lat, s.lng]} icon={markerIcon(s.n)} title={`${s.n}. ${s.city}`}>
          <Popup>
            <strong>
              {s.n}. {s.city}
            </strong>
            {s.affinity != null && <div>Affinity {Math.round(s.affinity * 100)}%</div>}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
