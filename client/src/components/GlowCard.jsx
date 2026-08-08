import { useState, useEffect } from 'react'

function getVibrantColor(imageUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 40
      canvas.height = 60
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, 40, 60)
      const { data } = ctx.getImageData(0, 0, 40, 60)

      let bestColor = null
      let bestScore = -1

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2]
        const max = Math.max(r, g, b) / 255
        const min = Math.min(r, g, b) / 255
        const l = (max + min) / 2
        const d = max - min
        const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
        // Score : saturation élevée + luminosité moyenne (ni trop sombre, ni trop clair)
        const score = s * (1 - Math.abs(l - 0.45))
        if (score > bestScore) {
          bestScore = score
          bestColor = `rgb(${r},${g},${b})`
        }
      }
      resolve(bestColor || '#E50914')
    }
    img.onerror = () => resolve('#E50914')
    img.src = imageUrl
  })
}

export function useVibrantColor(imageUrl) {
  const [color, setColor] = useState(null)
  useEffect(() => {
    if (!imageUrl) return
    getVibrantColor(imageUrl).then(setColor)
  }, [imageUrl])
  return color
}

export default function GlowCard({ children, imageUrl, className = '', style = {} }) {
  const color = useVibrantColor(imageUrl)
  const [hovered, setHovered] = useState(false)

  return (
    <div
      className={className}
      style={{
        ...style,
        transition: 'box-shadow 0.35s ease',
        boxShadow: hovered && color ? `0 0 28px 6px ${color}70` : 'none',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children}
    </div>
  )
}
