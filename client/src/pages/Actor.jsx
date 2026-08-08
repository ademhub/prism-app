import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getActorFilms, img } from '../api'
import MediaCard from '../components/MediaCard'

export default function Actor() {
  const { name }            = useParams()
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    setData(null)
    getActorFilms(decodeURIComponent(name))
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [name])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <img src="/logo-icon-bold.svg?v=8" alt="Prism" className="w-16 h-16 animate-pulse" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-warm/50">Acteur introuvable.</p>
        <Link to="/" className="text-accent text-sm hover:underline">← Retour</Link>
      </div>
    )
  }

  const photo = data.photo_path ? img(data.photo_path, 'w185') : null

  return (
    <div className="min-h-screen pb-32">
      {/* Header */}
      <div className="relative h-40 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-surface-2/60 to-surface" />
        <Link
          to={-1}
          className="absolute top-20 left-8 text-warm/60 hover:text-warm text-sm flex items-center gap-1.5 transition-colors"
        >
          ← Retour
        </Link>
      </div>

      <div className="max-w-screen-xl mx-auto px-8 -mt-6 animate-fade-up">
        {/* Identité acteur */}
        <div className="flex items-center gap-6 mb-12">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-surface-2 border-2 border-white/10 shrink-0 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
            {photo ? (
              <img src={photo} alt={data.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-display text-warm/20 text-3xl">
                {data.name[0]}
              </div>
            )}
          </div>
          <div>
            <h1 className="font-display text-5xl text-warm tracking-wide leading-none mb-1">
              {data.name}
            </h1>
            <p className="text-warm/35 text-sm">
              {data.films.length} film{data.films.length > 1 ? 's' : ''} dans la bibliothèque
            </p>
          </div>
        </div>

        {/* Grille de films */}
        <div className="flex flex-wrap gap-5">
          {data.films.map((m, i) => (
            <MediaCard key={m.id} media={m} index={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
