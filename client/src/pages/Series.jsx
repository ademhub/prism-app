import { useEffect, useMemo, useRef, useState } from 'react'
import { getSeries } from '../api'
import MediaCard from '../components/MediaCard'

const GENRES = [
  'Drame', 'Crime', 'Comédie', 'Action & Adventure',
  'Science-Fiction & Fantastique', 'Animation', 'Documentaire',
  'Mystère', 'Familial', 'War & Politics', 'Western',
]

const PAGE_SIZE = 60

export default function Series() {
  const [allMedia, setAllMedia] = useState([])
  const [loading, setLoading]   = useState(true)
  const [genre, setGenre]       = useState(null)
  const [sort, setSort]         = useState('note')
  const [query, setQuery]       = useState('')
  const [page, setPage]         = useState(1)
  const sentinelRef             = useRef(null)

  useEffect(() => {
    getSeries().then(setAllMedia).finally(() => setLoading(false))
  }, [])

  // Reset page quand filtre/tri/recherche change
  useEffect(() => { setPage(1) }, [genre, sort, query])

  const series = useMemo(() => {
    let list = allMedia

    if (query.trim()) {
      const q = query.toLowerCase()
      list = list.filter((m) =>
        (m.titre_officiel || m.titre_brut || '').toLowerCase().includes(q)
      )
    }

    if (genre) list = list.filter((m) => (m.genres ?? []).includes(genre))

    if (sort === 'note')  list = [...list].sort((a, b) => (b.note ?? 0) - (a.note ?? 0))
    if (sort === 'annee') list = [...list].sort((a, b) => (b.annee_devinee ?? 0) - (a.annee_devinee ?? 0))
    if (sort === 'titre') list = [...list].sort((a, b) =>
      (a.titre_officiel || a.titre_brut || '').localeCompare(b.titre_officiel || b.titre_brut || '')
    )

    return list
  }, [allMedia, genre, sort, query])

  const visible = series.slice(0, page * PAGE_SIZE)
  const hasMore = visible.length < series.length

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setPage((p) => p + 1) },
      { rootMargin: '400px' }
    )
    obs.observe(sentinelRef.current)
    return () => obs.disconnect()
  }, [hasMore, visible.length])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <img src="/logo-icon.svg?v=7" alt="" className="w-12 h-12 animate-pulse" />
    </div>
  )

  return (
    <div className="min-h-screen pb-36 pt-12 px-8 max-w-screen-xl mx-auto">

      <div className="mb-8">
        <h1 className="font-display text-4xl text-warm tracking-wide mb-1">Séries</h1>
        <p className="text-warm/30 text-sm">{series.length} série{series.length > 1 ? 's' : ''} disponible{series.length > 1 ? 's' : ''}</p>
      </div>

      <div className="flex flex-col gap-4 mb-8">
        <input
          type="search"
          placeholder="Rechercher une série…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full max-w-xs bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-warm placeholder-warm/25 focus:outline-none focus:border-accent/40 transition-colors"
        />

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setGenre(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              !genre ? 'bg-accent text-white' : 'bg-white/6 text-warm/50 hover:bg-white/10 hover:text-warm'
            }`}
          >
            Tous
          </button>
          {GENRES.map((g) => (
            <button key={g} onClick={() => setGenre(genre === g ? null : g)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                genre === g ? 'bg-accent text-white' : 'bg-white/6 text-warm/50 hover:bg-white/10 hover:text-warm'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {[
            { key: 'note',  label: 'Meilleures notes' },
            { key: 'annee', label: 'Plus récentes' },
            { key: 'titre', label: 'A → Z' },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setSort(key)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                sort === key ? 'bg-white/12 text-warm' : 'text-warm/35 hover:text-warm/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {series.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 gap-4 text-center">
          <p className="font-display text-4xl text-warm/8 tracking-widest">AUCUNE SÉRIE</p>
          <p className="text-warm/25 text-sm">Aucune série ne correspond à ce filtre.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-4">
            {visible.map((m, i) => (
              <MediaCard key={m.id} media={m} index={i % PAGE_SIZE} />
            ))}
          </div>
          {hasMore && <div ref={sentinelRef} className="h-12" />}
        </>
      )}
    </div>
  )
}
