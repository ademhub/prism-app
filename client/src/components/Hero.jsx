import { Link } from 'react-router-dom'
import { img } from '../api'

export default function Hero({ media }) {
  if (!media) {
    return <div className="w-full h-[88vh] bg-surface-2 animate-pulse" />
  }

  const backdrop = img(media.backdrop_path, 'w1280')
  const titre    = media.titre_officiel || media.titre_brut

  return (
    <div className="relative w-full h-[88vh] overflow-hidden">
      {/* Image backdrop */}
      {backdrop ? (
        <img
          src={backdrop}
          alt={titre}
          className="absolute inset-0 w-full h-full object-cover scale-[1.04]"
          style={{ objectPosition: 'center 20%' }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-surface-2 to-surface" />
      )}

      {/* Dégradés superposés */}
      <div className="absolute inset-0 bg-gradient-to-r from-surface/95 via-surface/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-black/40" />

      {/* Grain subtil */}
      <div className="absolute inset-0 opacity-[0.025]"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\' opacity=\'1\'/%3E%3C/svg%3E")' }}
      />

      {/* Contenu */}
      <div className="relative h-full flex flex-col justify-end pb-28 px-10 max-w-3xl">
        {/* Genres */}
        {media.genres?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {media.genres.slice(0, 4).map((g) => (
              <span key={g} className="text-[11px] font-medium px-2.5 py-0.5 rounded-full border border-accent/35 text-accent/90 tracking-wide">
                {g}
              </span>
            ))}
          </div>
        )}

        {/* Titre */}
        <h1
          className="font-display leading-none tracking-wide mb-4 text-warm"
          style={{
            fontSize: titre?.length > 20 ? '3.8rem' : '5rem',
            textShadow: '0 2px 30px rgba(0,0,0,0.6)',
          }}
        >
          {titre}
        </h1>

        {/* Méta */}
        <div className="flex items-center flex-wrap gap-4 mb-4 text-sm">
          {media.note > 0 && (
            <span className="flex items-center gap-1.5 text-accent font-bold text-base">
              ★ <span>{media.note.toFixed(1)}</span>
              <span className="text-warm/30 font-normal text-xs">/10</span>
            </span>
          )}
          {media.duree > 0 && (
            <span className="text-warm/55 text-sm">
              {Math.floor(media.duree / 60)}h {media.duree % 60 > 0 ? `${media.duree % 60}min` : ''}
            </span>
          )}
          {media.annee_devinee > 0 && (
            <span className="text-warm/55 text-sm">{media.annee_devinee}</span>
          )}
        </div>

        {/* Synopsis */}
        {media.synopsis && (
          <p className="text-warm/75 text-sm leading-relaxed mb-7 line-clamp-3 max-w-lg">
            {media.synopsis}
          </p>
        )}

        {/* Boutons */}
        <div className="flex gap-3">
          <Link
            to={`/media/${media.id}`}
            className="flex items-center gap-2.5 bg-accent text-surface font-bold px-8 py-3 rounded-xl text-sm hover:brightness-110 active:scale-95 transition-all shadow-[0_4px_20px_rgba(240,169,62,0.35)]"
          >
            <span className="text-lg leading-none">▶</span>
            Lancer
          </Link>
          <Link
            to={`/media/${media.id}`}
            className="flex items-center gap-2.5 bg-white/10 backdrop-blur-md text-warm font-medium px-8 py-3 rounded-xl text-sm border border-white/12 hover:bg-white/16 active:scale-95 transition-all"
          >
            <span className="text-base leading-none opacity-70">ℹ</span>
            Détails
          </Link>
        </div>
      </div>

      {/* Badge source (Netflix, Disney+, etc.) */}
      {media.source && media.source !== 'streaming' && (
        <div className="absolute top-24 right-10">
          <span className="text-[10px] uppercase tracking-widest text-warm/25 font-semibold px-3 py-1 rounded border border-white/8">
            {media.source}
          </span>
        </div>
      )}
    </div>
  )
}
