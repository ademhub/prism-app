import { Link } from 'react-router-dom'
import { img } from '../api'
import { useFavorites } from '../context/FavoritesContext'

export default function MediaCard({ media, progress, index, fluid = false }) {
  const { isFav, toggle } = useFavorites()
  const poster = img(media.poster_path, 'w342')
  const titre  = media.titre_officiel || media.titre_brut

  const pct =
    progress != null && media.duree > 0
      ? Math.min(100, (progress / (media.duree * 60)) * 100)
      : 0
  const showBar = pct >= 2 && pct < 96

  return (
    <Link
      to={`/media/${media.id}`}
      className={`group relative cursor-pointer animate-fade-up ${fluid ? 'w-full' : 'shrink-0 w-32 md:w-40'}`}
      style={index != null ? { animationDelay: `${Math.min(index * 35, 280)}ms` } : undefined}
    >
      <div className="relative aspect-[2/3] bg-surface-2 rounded-xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.4)] transition-shadow duration-300 group-hover:shadow-[0_8px_32px_rgba(0,0,0,0.65)]">
        {poster ? (
          <img src={poster} alt={titre} loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex items-center justify-center p-3">
            <span className="font-display text-warm/20 text-center text-sm leading-tight">{titre}</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
          <div className="w-11 h-11 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center shadow-lg scale-90 group-hover:scale-100 transition-transform duration-200">
            <span className="text-white text-base ml-0.5">▶</span>
          </div>
        </div>
        <button
          onClick={(e) => { e.preventDefault(); toggle(media.id) }}
          className={`absolute top-2 right-2 z-10 w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 opacity-0 group-hover:opacity-100 ${isFav(media.id) ? 'bg-accent text-white opacity-100' : 'bg-black/50 text-white/70 hover:text-white'}`}
          title={isFav(media.id) ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        >
          {isFav(media.id) ? '♥' : '♡'}
        </button>
        <div className="absolute inset-0 rounded-xl ring-0 group-hover:ring-2 group-hover:ring-accent/50 transition-all duration-200 pointer-events-none" />
        {showBar && (
          <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/10">
            <div className="h-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <p className="text-warm/90 text-[12px] font-medium line-clamp-1 leading-tight transition-colors duration-200 group-hover:text-warm">
          {titre}
        </p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {media.media_type === 'tv' && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 leading-none">SÉRIE</span>
          )}
          {media.note > 0 && (
            <span className="text-accent text-[11px] font-bold">★ {media.note.toFixed(1)}</span>
          )}
          {media.annee_devinee > 0 && (
            <span className="text-warm/35 text-[11px]">{media.annee_devinee}</span>
          )}
        </div>
      </div>
    </Link>
  )
}
