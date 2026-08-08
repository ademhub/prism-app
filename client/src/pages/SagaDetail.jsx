import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getMedia, getCollections, img } from '../api'
import { SAGA_PATTERNS, titleMatchesSaga } from '../lib/sagas'
import MediaCard from '../components/MediaCard'

export default function SagaDetail() {
  const { key }                   = useParams()
  const [allMedia, setAllMedia]   = useState([])
  const [collection, setCollection] = useState(null)
  const [loading, setLoading]     = useState(true)

  const saga = useMemo(() => SAGA_PATTERNS.find((s) => s.key === key), [key])

  useEffect(() => {
    Promise.all([getMedia(), getCollections()])
      .then(([media, collections]) => {
        setAllMedia(media)
        setCollection(collections.find((c) => c.key === key) ?? null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [key])

  const movies = useMemo(() => {
    if (!saga) return []
    return allMedia
      .filter((m) => {
        const titre = m.titre_officiel || m.titre_brut || ''
        return m.poster_path && titleMatchesSaga(titre, saga.patterns)
      })
      .sort((a, b) => (b.annee_devinee ?? 0) - (a.annee_devinee ?? 0))
  }, [allMedia, saga])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-accent/50 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    )
  }

  if (!saga) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-warm/40">Saga introuvable.</p>
        <Link to="/" className="text-accent text-sm hover:underline">← Accueil</Link>
      </div>
    )
  }

  const backdropUrl = collection?.backdrop_path ? img(collection.backdrop_path, 'w1280') : null

  return (
    <main className="min-h-screen pb-32">
      {/* Hero de la saga */}
      <div className="relative w-full h-56 md:h-72 overflow-hidden">
        {backdropUrl && (
          <img
            src={backdropUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/60 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-surface/40 to-transparent" />

        <div className="relative h-full flex flex-col justify-end px-8 md:px-12 pb-8">
          <Link to="/" className="text-warm/40 hover:text-warm text-xs tracking-widest uppercase mb-4 transition-colors w-fit">
            ← Accueil
          </Link>

          <img
            src={`/logos/${saga.key}.png`}
            alt={saga.name}
            className="h-16 md:h-24 w-auto object-contain object-left drop-shadow-[0_0_20px_rgba(0,0,0,0.9)]"
          />

          <p className="mt-3 text-warm/40 text-sm">
            {movies.length} film{movies.length > 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Grille de films */}
      <div className="px-6 md:px-10 mt-8">
        {movies.length === 0 ? (
          <p className="text-warm/30 text-center mt-24 font-display tracking-widest">AUCUN FILM DISPONIBLE</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {movies.map((m) => (
              <MediaCard key={m.id} media={m} />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
