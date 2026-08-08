import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { img } from '../api'
import { useFavorites } from '../context/FavoritesContext'

function pickRandom(list, exclude) {
  const pool = list.filter((m) => m.id !== exclude)
  if (!pool.length) return list[Math.floor(Math.random() * list.length)]
  return pool[Math.floor(Math.random() * pool.length)]
}

export default function RandomFilmModal({ allMedia, onClose }) {
  const navigate          = useNavigate()
  const { isFav, toggle } = useFavorites()

  const eligible = useMemo(
    () => allMedia.filter((m) => m.poster_path && (m.titre_officiel || m.titre_brut) && (m.note ?? 0) >= 6),
    [allMedia]
  )

  const [film, setFilm] = useState(() => pickRandom(eligible, null))

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter')  handleWatch()
      if (e.key === ' ')      { e.preventDefault(); next() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [film])

  const next = () => setFilm(pickRandom(eligible, film?.id))

  const handleWatch = () => {
    onClose()
    navigate(`/media/${film.id}`)
  }

  if (!film) return null

  const poster   = img(film.poster_path, 'w500')
  const backdrop = img(film.backdrop_path, 'w780')
  const titre    = film.titre_officiel || film.titre_brut

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in px-4"
    >
      <div className="relative w-full max-w-lg rounded-2xl overflow-hidden bg-surface border border-white/8 shadow-[0_24px_80px_rgba(0,0,0,0.7)]">

        {/* Backdrop flou en fond */}
        {backdrop && (
          <div className="absolute inset-0">
            <img src={backdrop} alt="" className="w-full h-full object-cover opacity-10" />
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/80 to-surface/60" />
          </div>
        )}

        <div className="relative p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <span className="text-[10px] uppercase tracking-[0.25em] text-warm/35 font-semibold">Film au hasard</span>
            <button onClick={onClose} className="text-warm/30 hover:text-warm text-xs transition-colors">✕</button>
          </div>

          {/* Contenu */}
          <div className="flex gap-5">
            {/* Poster */}
            <div className="w-28 shrink-0 rounded-xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              {poster
                ? <img src={poster} alt={titre} className="w-full aspect-[2/3] object-cover" />
                : <div className="w-full aspect-[2/3] bg-surface-2 flex items-center justify-center"><span className="text-warm/20 text-xs text-center px-2">{titre}</span></div>
              }
            </div>

            {/* Infos */}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <h2 className="font-display text-2xl text-warm leading-tight mb-2 line-clamp-2">{titre}</h2>

              <div className="flex items-center gap-3 mb-3 text-sm flex-wrap">
                {film.note > 0 && <span className="text-accent font-bold">★ {film.note.toFixed(1)}</span>}
                {film.annee_devinee > 0 && <span className="text-warm/40">{film.annee_devinee}</span>}
                {film.duree > 0 && <span className="text-warm/40">{Math.floor(film.duree / 60)}h{film.duree % 60 > 0 ? ` ${film.duree % 60}min` : ''}</span>}
              </div>

              {film.genres?.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {film.genres.slice(0, 3).map((g) => (
                    <span key={g} className="text-[10px] px-2 py-0.5 rounded border border-accent/30 text-accent/80">{g}</span>
                  ))}
                </div>
              )}

              {film.synopsis && (
                <p className="text-warm/45 text-xs leading-relaxed line-clamp-3">{film.synopsis}</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-6">
            <button
              onClick={handleWatch}
              className="flex-1 flex items-center justify-center gap-2 bg-accent text-white font-semibold py-2.5 rounded-xl text-sm hover:brightness-110 transition-all active:scale-95"
            >
              <span>▶</span> Regarder
            </button>

            <button
              onClick={() => toggle(film.id)}
              className={`w-10 h-10 rounded-xl border flex items-center justify-center text-lg transition-all ${isFav(film.id) ? 'bg-accent border-accent text-white' : 'border-white/15 text-white/40 hover:border-white/30 hover:text-white'}`}
            >
              {isFav(film.id) ? '♥' : '♡'}
            </button>

            <button
              onClick={next}
              className="w-10 h-10 rounded-xl border border-white/15 text-white/40 hover:border-white/30 hover:text-white flex items-center justify-center text-base transition-all"
              title="Suivant (Espace)"
            >
              ↻
            </button>
          </div>

          <p className="text-center text-warm/15 text-[10px] mt-3">Espace → suivant · Entrée → regarder · Échap → fermer</p>
        </div>
      </div>
    </div>
  )
}
