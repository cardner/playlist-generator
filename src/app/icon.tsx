import { ImageResponse } from 'next/og'

// Image metadata
export const size = {
  width: 32,
  height: 32,
}
export const contentType = 'image/png'

// Image generation
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #e91e63 0%, #c2185b 100%)',
          borderRadius: '4px',
        }}
      >
        {/* Music note icon - using a more visible Unicode character */}
        <div
          style={{
            fontSize: '18px',
            color: 'white',
            fontWeight: 'bold',
            lineHeight: '1',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          ♫
        </div>
      </div>
    ),
    {
      ...size,
    }
  )
}

