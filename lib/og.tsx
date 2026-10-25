import { ImageResponse } from 'next/og'

// Shared by app/opengraph-image.tsx and app/twitter-image.tsx.
export const ogSize = { width: 1200, height: 630 }
export const ogAlt = 'GigRoute: route your next tour to where your fans already are, powered by Qloo taste data'

const STOPS = [
  { x: 620, y: 210, n: 1 },
  { x: 780, y: 110, n: 2 },
  { x: 930, y: 190, n: 3 },
  { x: 1100, y: 80, n: 4 },
]

export function renderOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: 'radial-gradient(ellipse at top right, #3b2a06 0%, #09090b 60%)',
          color: '#f4f4f5',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        <svg width="1200" height="630" style={{ position: 'absolute', left: 0, top: 0 }}>
          <polyline
            points={STOPS.map((s) => `${s.x},${s.y}`).join(' ')}
            fill="none"
            stroke="#fbbf24"
            strokeOpacity="0.35"
            strokeWidth="6"
            strokeDasharray="14 12"
          />
          {STOPS.map((s) => (
            <circle key={s.n} cx={s.x} cy={s.y} r="18" fill="#fbbf24" fillOpacity="0.45" />
          ))}
        </svg>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: '#fbbf24',
              color: '#09090b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 40,
              fontWeight: 800,
            }}
          >
            G
          </div>
          <div style={{ fontSize: 40, fontWeight: 700, color: '#fcd34d' }}>GigRoute</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 68, fontWeight: 800, lineHeight: 1.1, maxWidth: 950 }}>
            Route your next tour to where your fans already are.
          </div>
          <div style={{ marginTop: 24, fontSize: 30, color: '#d4d4d8' }}>
            Cities, venues, co-bills and pitch drafts from Qloo taste data, with the why behind every pick.
          </div>
        </div>
      </div>
    ),
    ogSize
  )
}
