import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import Hls from 'hls.js'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getMediaDetail, getMedia, saveProgress, img, API } from '../api'
import MediaCard from '../components/MediaCard'
import { useFavorites } from '../context/FavoritesContext'
import TrailerModal from '../components/TrailerModal'
import ShareModal from '../components/ShareModal'
import { AnimatePresence } from 'framer-motion'

// ── Lecteur HLS / Embed ───────────────────────────────────────────────────────

function StreamPlayer({ mediaId, season, episode, backdrop, poster }) {
  const [phase, setPhase]       = useState('idle')
  const [stream, setStream]     = useState(null)
  const [errMsg, setErrMsg]     = useState('')
  const [srcIdx, setSrcIdx]     = useState(0)
  const [totalSrc, setTotalSrc] = useState(4)
  const [srcOpen, setSrcOpen]   = useState(false)
  const videoRef = useRef(null)
  const hlsRef   = useRef(null)

  useEffect(() => { setPhase('idle'); setStream(null); setSrcIdx(0); setSrcOpen(false) }, [season, episode])
  useEffect(() => () => hlsRef.current?.destroy(), [])

  const launch = async (sourceIdx = 0) => {
    setSrcOpen(false)
    setPhase('loading')
    try {
      const p = new URLSearchParams()
      if (season)  p.set('season', season)
      if (episode) p.set('episode', episode)
      if (sourceIdx) p.set('sourceIdx', sourceIdx)
      const res  = await fetch(`${API}/api/stream-url/${mediaId}?${p}`)
      const data = await res.json()
      if (!data.url) throw new Error(data.error ?? 'Stream introuvable')
      setStream(data)
      if (data.totalSources) setTotalSrc(data.totalSources)
      setPhase('playing')
      if (data.type === 'hls') {
        await new Promise((r) => setTimeout(r, 80))
        const video = videoRef.current
        if (!video) return
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: true })
          hlsRef.current = hls
          hls.loadSource(data.url)
          hls.attachMedia(video)
          hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
          hls.on(Hls.Events.ERROR, (_e, d) => {
            if (d.fatal) { setErrMsg('Erreur de lecture'); setPhase('error') }
          })
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = data.url
          video.play().catch(() => {})
        } else {
          throw new Error('HLS non supporté')
        }
      }
    } catch (err) {
      setErrMsg(err.message)
      setPhase('error')
    }
  }

  const bg = backdrop || poster
  const thumb = bg ? `url(${bg})` : undefined

  // Coque commune : ratio 16:9 pleine largeur avec fond cinéma
  const Shell = ({ children, onClick }) => (
    <div
      onClick={onClick}
      className={`relative w-full overflow-hidden rounded-2xl bg-black shadow-[0_8px_48px_rgba(0,0,0,0.7)] ${onClick ? 'cursor-pointer' : ''}`}
      style={{ paddingBottom: '56.25%' }}
    >
      {thumb && (
        <>
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: thumb }} />
          <div className="absolute inset-0 bg-black/60" />
        </>
      )}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  )

  if (phase === 'idle') return (
    <Shell onClick={() => launch(srcIdx)}>
      <div className="group flex flex-col items-center gap-3">
        <div className="w-18 h-18 rounded-full bg-white/10 border border-white/25 backdrop-blur-sm flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:bg-accent group-hover:border-accent group-hover:shadow-[0_0_32px_rgba(229,9,20,0.5)]"
          style={{ width: '72px', height: '72px' }}>
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8 text-white ml-1">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
        <span className="text-white/50 text-sm font-medium tracking-wide">Lancer la lecture</span>
      </div>
    </Shell>
  )

  if (phase === 'loading') return (
    <Shell>
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        <span className="text-white/40 text-sm">Chargement…</span>
      </div>
    </Shell>
  )

  if (phase === 'error') return (
    <Shell>
      <div className="flex flex-col items-center gap-4 text-center px-8">
        <div className="w-12 h-12 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6 text-red-400">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <p className="text-white/60 text-sm">{errMsg}</p>
        <div className="flex gap-2">
          <button onClick={() => launch(srcIdx)}
            className="px-4 py-2 rounded-xl bg-white/10 border border-white/15 text-white/70 text-sm hover:bg-white/20 hover:text-white transition-all">
            Réessayer
          </button>
          {srcIdx < totalSrc - 1 && (
            <button onClick={() => { setSrcIdx(s => s + 1); launch(srcIdx + 1) }}
              className="px-4 py-2 rounded-xl bg-accent/80 text-white text-sm hover:bg-accent transition-all">
              Source suivante →
            </button>
          )}
        </div>
      </div>
    </Shell>
  )

  const SourceBar = () => totalSrc > 1 ? (
    <div className="flex items-center gap-2 mt-3 flex-wrap">
      <span className="text-warm/25 text-xs uppercase tracking-widest">Source</span>
      {Array.from({ length: totalSrc }, (_, i) => (
        <button key={i} onClick={() => { setSrcIdx(i); launch(i) }}
          className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
            i === srcIdx ? 'bg-accent text-white shadow-[0_0_12px_rgba(229,9,20,0.4)]' : 'bg-white/6 text-warm/40 hover:bg-white/12 hover:text-warm'
          }`}>
          {i + 1}
        </button>
      ))}
    </div>
  ) : null

  if (stream?.type === 'embed') return (
    <div>
      <div className="relative w-full rounded-2xl overflow-hidden shadow-[0_8px_48px_rgba(0,0,0,0.7)] bg-black" style={{ paddingBottom: '56.25%' }}>
        <iframe
          key={stream.url}
          src={stream.url}
          className="absolute inset-0 w-full h-full"
          allowFullScreen
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          frameBorder="0"
          scrolling="no"
          title="Lecteur"
        />
      </div>
      <SourceBar />
    </div>
  )

  return (
    <div>
      <div className="relative w-full rounded-2xl overflow-hidden shadow-[0_8px_48px_rgba(0,0,0,0.7)] bg-black" style={{ paddingBottom: '56.25%' }}>
        <video ref={videoRef} controls playsInline className="absolute inset-0 w-full h-full object-contain" />
      </div>
      <SourceBar />
    </div>
  )
}

// ── Hook progression ──────────────────────────────────────────────────────────

function usePlaybackProgress(mediaId, initialPosition) {
  const videoRef    = useRef(null)
  const lastSavedAt = useRef(0)

  const handleLoadedMetadata = () => {
    if (videoRef.current && initialPosition > 5) videoRef.current.currentTime = initialPosition
  }

  const handleTimeUpdate = () => {
    const video = videoRef.current
    if (!video || video.paused) return
    const now = Date.now()
    if (now - lastSavedAt.current >= 10_000) {
      lastSavedAt.current = now
      saveProgress(mediaId, video.currentTime).catch(() => {})
    }
  }

  useEffect(() => () => {
    const video = videoRef.current
    if (!video || video.currentTime < 5) return
    navigator.sendBeacon('/api/progress',
      new Blob([JSON.stringify({ media_id: Number(mediaId), position_secondes: video.currentTime })],
        { type: 'application/json' }))
  }, [mediaId])

  return { videoRef, handleLoadedMetadata, handleTimeUpdate }
}

// ── Films similaires ──────────────────────────────────────────────────────────

function SimilarFilms({ media, allMedia }) {
  const rowRef = useRef(null)
  const scroll = (dir) => rowRef.current?.scrollBy({ left: dir * 700, behavior: 'smooth' })

  const similar = useMemo(() => {
    if (!media || !allMedia.length) return []
    const genres = new Set(media.genres ?? [])
    return allMedia
      .filter((m) => m.id !== media.id && m.poster_path && (m.titre_officiel || m.titre_brut) && (m.genres ?? []).some((g) => genres.has(g)))
      .sort((a, b) => {
        const sa = (a.genres ?? []).filter((g) => genres.has(g)).length
        const sb = (b.genres ?? []).filter((g) => genres.has(g)).length
        return sb !== sa ? sb - sa : (b.note ?? 0) - (a.note ?? 0)
      })
      .slice(0, 20)
  }, [media, allMedia])

  if (!similar.length) return null

  const btnCls = "w-8 h-8 rounded-full bg-white/10 border border-white/25 text-white flex items-center justify-center hover:bg-accent hover:border-accent hover:scale-110 active:scale-95 transition-all duration-200 shrink-0"

  return (
    <section className="mb-20">
      <div className="flex items-center justify-between mb-4">
        <p className="text-warm/30 text-xs uppercase tracking-widest font-semibold">Dans le même style</p>
        <div className="flex gap-2">
          <button onClick={() => scroll(-1)} className={btnCls}>
            <ChevronLeft className="size-4" />
          </button>
          <button onClick={() => scroll(1)} className={btnCls}>
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
      <div ref={rowRef} className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
        {similar.map((m, i) => <MediaCard key={m.id} media={m} index={i} />)}
      </div>
    </section>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Detail() {
  const { id }                        = useParams()
  const [media, setMedia]             = useState(null)
  const [allMedia, setAllMedia]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [showTrailer, setShowTrailer] = useState(false)
  const [showPlayer, setShowPlayer]   = useState(false)
  const [showShare, setShowShare]     = useState(false)
  const [selSaison, setSelSaison]     = useState(1)
  const [selEpisode, setSelEpisode]   = useState(null)
  const playerRef                     = useRef(null)
  const { isFav, toggle }             = useFavorites()

  useEffect(() => {
    setLoading(true)
    setShowPlayer(false)
    setSelSaison(1)
    setSelEpisode(null)
    Promise.all([getMediaDetail(id), getMedia()])
      .then(([detail, all]) => { setMedia(detail); setAllMedia(all) })
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (media?.media_type === 'tv' && media.saisons) {
      setSelSaison(1)
      setSelEpisode(media.saisons[1]?.[0]?.episode ?? null)
    }
  }, [media])

  const { videoRef, handleLoadedMetadata, handleTimeUpdate } = usePlaybackProgress(
    id, media?.position_secondes ?? 0
  )

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <img src="/logo-icon-bold.svg?v=8" alt="Prism" className="w-16 h-16 animate-pulse" />
    </div>
  )

  if (!media) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <p className="text-warm/40">Média introuvable.</p>
      <Link to="/" className="text-accent text-sm hover:underline">← Accueil</Link>
    </div>
  )

  const backdrop = img(media.backdrop_path, 'w1280')
  const poster   = img(media.poster_path, 'w500')
  const titre    = media.titre_officiel || media.titre_brut
  const favId    = Number(id)

  const pct = media.position_secondes && media.duree
    ? Math.min(99, (media.position_secondes / (media.duree * 60)) * 100)
    : 0
  const remainMin = media.position_secondes && media.duree
    ? Math.round(Math.max(0, media.duree * 60 - media.position_secondes) / 60)
    : null

  return (
    <div className="min-h-screen">
      {showTrailer && <TrailerModal mediaId={id} onClose={() => setShowTrailer(false)} />}

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showShare && (
          <ShareModal
            shareData={{ type: 'share', kind: 'media', id: media.id, title: media.titre_officiel || media.titre_brut, poster: media.poster_path, year: media.annee_devinee }}
            onClose={() => setShowShare(false)}
          />
        )}
      </AnimatePresence>

      <div className="relative h-[72vh] overflow-hidden">
        {backdrop
          ? <img src={backdrop} alt="" className="absolute inset-0 w-full h-full object-cover" />
          : <div className="absolute inset-0 bg-surface-2" />
        }
        {/* Gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-surface/80 via-surface/20 to-transparent" />

        {/* Retour */}
        <Link to="/" className="absolute top-6 left-8 z-10 w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm border border-white/10 flex items-center justify-center text-warm/60 hover:text-warm hover:bg-black/50 transition-all">
          ←
        </Link>

        {/* Infos superposées sur le backdrop */}
        <div className="absolute bottom-0 left-0 right-0 px-8 md:px-14 pb-10 flex gap-8 items-end">
          {/* Poster visible sur mobile */}
          {poster && (
            <div className="hidden sm:block w-36 shrink-0 rounded-xl overflow-hidden shadow-[0_12px_48px_rgba(0,0,0,0.7)] self-end">
              <img src={poster} alt={titre} className="w-full" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            {/* Genres */}
            {media.genres?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {media.genres.map((g) => (
                  <span key={g} className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-sm text-warm/70 tracking-wide border border-white/10">
                    {g}
                  </span>
                ))}
              </div>
            )}

            <h1 className="font-display text-5xl md:text-7xl text-white leading-none tracking-wide mb-3 drop-shadow-lg">
              {titre}
            </h1>

            {/* Meta */}
            <div className="flex items-center gap-4 flex-wrap text-sm mb-5">
              {media.note > 0 && (
                <span className="text-accent font-bold text-base">★ {media.note.toFixed(1)}</span>
              )}
              {media.annee_devinee > 0 && <span className="text-white/50">{media.annee_devinee}</span>}
              {media.duree > 0 && (
                <span className="text-white/50">{Math.floor(media.duree / 60)}h{media.duree % 60 > 0 ? ` ${media.duree % 60}min` : ''}</span>
              )}
              {remainMin > 1 && (
                <span className="text-accent/80 text-xs px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20">
                  {remainMin} min restantes
                </span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setTimeout(() => playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)}
                className="flex items-center gap-2.5 bg-white text-black font-bold px-5 py-3 rounded-full text-sm hover:bg-white/90 transition-all active:scale-95 shadow-lg"
              >
                <span className="text-base leading-none">▶</span>
                {pct > 2 ? 'Reprendre' : 'Regarder'}
              </button>

              <button
                onClick={() => setShowTrailer(true)}
                className="flex items-center gap-2 px-5 py-3 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-white text-sm hover:bg-white/20 transition-all"
              >
                Bande-annonce
              </button>

              <button
                onClick={() => toggle(favId)}
                className={`w-11 h-11 rounded-full border flex items-center justify-center text-lg transition-all ${isFav(favId) ? 'bg-accent border-accent text-white' : 'bg-white/10 backdrop-blur-sm border-white/15 text-white hover:bg-white/20'}`}
              >
                {isFav(favId) ? '♥' : '♡'}
              </button>

              <button
                onClick={() => setShowShare(true)}
                className="w-11 h-11 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 text-white flex items-center justify-center hover:bg-white/20 transition-all"
                title="Partager"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              </button>
            </div>

            {/* Barre de progression */}
            {pct > 2 && (
              <div className="mt-3 w-48 h-0.5 bg-white/15 rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── CONTENU ──────────────────────────────────────────────────── */}
      <div className="max-w-screen-xl mx-auto px-8 md:px-14 pt-10 pb-8">

        {/* Synopsis + Cast */}
        <div className="flex flex-col gap-6 md:flex-row md:gap-12 mb-12">
          <div className="flex-1 min-w-0">
            {media.synopsis && (
              <p className="text-warm/65 leading-relaxed text-[0.95rem] max-w-2xl mb-8">
                {media.synopsis}
              </p>
            )}

            {/* Casting */}
            {media.cast?.length > 0 && (
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-1">
                {media.cast.map((actor) => (
                  <Link key={actor.nom} to={`/actor/${encodeURIComponent(actor.nom)}`}
                    className="flex flex-col items-center gap-1.5 shrink-0 w-14 group">
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-surface-2 border-2 border-white/6 group-hover:border-accent/50 transition-colors">
                      {actor.photo_path
                        ? <img src={img(actor.photo_path, 'w185')} alt={actor.nom} className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                        : <div className="w-full h-full flex items-center justify-center font-display text-warm/20 text-lg">{actor.nom[0]}</div>
                      }
                    </div>
                    <span className="text-[10px] text-warm/40 text-center leading-tight line-clamp-2 group-hover:text-accent transition-colors">{actor.nom}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Providers */}
          {(() => {
            const wp = media.watch_providers
            if (!wp) return null
            const all = [
              ...(wp.flatrate ?? []),
              ...(wp.rent ?? []),
              ...(wp.buy ?? []),
            ]
            const seen = new Set()
            const unique = all.filter((p) => { if (seen.has(p.provider_id)) return false; seen.add(p.provider_id); return true })
            if (!unique.length) return null
            return (
              <div className="shrink-0 flex flex-col gap-2">
                <p className="text-warm/25 text-[10px] uppercase tracking-widest mb-1">Streaming</p>
                <div className="flex flex-wrap gap-2 max-w-[180px]">
                  {unique.map((p) => (
                    <a key={p.provider_id} href={wp.link ?? '#'} target="_blank" rel="noopener noreferrer"
                      title={p.provider_name}
                      className="w-10 h-10 rounded-xl overflow-hidden border border-white/8 hover:border-accent/50 transition-colors shadow-sm">
                      <img src={`https://image.tmdb.org/t/p/w45${p.logo_path}`} alt={p.provider_name} className="w-full h-full object-cover" />
                    </a>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>

        {/* ── Lecteur (films) ──────────────────────────────────────── */}
        {media.media_type !== 'tv' && (
          <div ref={playerRef} className="mb-10">
            {media.type === 'stream' ? (
              <StreamPlayer
                mediaId={id}
                backdrop={backdrop}
                poster={poster}
              />
            ) : (
              <div className="relative w-full rounded-2xl overflow-hidden shadow-[0_8px_48px_rgba(0,0,0,0.7)] bg-black" style={{ paddingBottom: '56.25%' }}>
                <video ref={videoRef} controls preload="metadata"
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleTimeUpdate}
                  className="absolute inset-0 w-full h-full object-contain"
                  src={`/api/stream/${media.id}`} />
              </div>
            )}
          </div>
        )}

        {/* ── Séries : lecteur + sélecteur saison/épisode ──────────── */}
        {media.media_type === 'tv' && (
          <div className="mb-10">
            {/* Lecteur série */}
            <div ref={playerRef} className="mb-6">
              <StreamPlayer
                mediaId={id}
                season={selSaison}
                episode={selEpisode}
                backdrop={backdrop}
                poster={poster}
              />
            </div>

            {/* Sélecteur saisons/épisodes */}
            {media.saisons && (
              <div className="rounded-2xl bg-white/3 border border-white/6 p-4">
                {/* Onglets saisons */}
                <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar pb-1">
                  {Object.keys(media.saisons).map((s) => (
                    <button key={s}
                      onClick={() => { setSelSaison(Number(s)); setSelEpisode(null) }}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                        selSaison === Number(s) ? 'bg-accent text-white' : 'bg-white/6 text-warm/50 hover:bg-white/10 hover:text-warm'
                      }`}
                    >
                      Saison {s}
                    </button>
                  ))}
                </div>
                {/* Épisodes */}
                <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto no-scrollbar">
                  {(media.saisons[selSaison] ?? []).map((ep) => {
                    const active = selEpisode === ep.episode
                    return (
                      <button key={ep.episode}
                        onClick={() => {
                          setSelEpisode(ep.episode)
                          setShowPlayer(true)
                          setTimeout(() => playerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
                        }}
                        className={`flex items-center gap-3 text-left px-3 py-2.5 rounded-xl transition-colors ${
                          active ? 'bg-accent/15 border border-accent/30' : 'hover:bg-white/5 border border-transparent'
                        }`}
                      >
                        <span className={`text-xs font-mono shrink-0 w-8 ${active ? 'text-accent font-bold' : 'text-warm/30'}`}>
                          E{ep.episode}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm truncate ${active ? 'text-warm font-medium' : 'text-warm/60'}`}>{ep.titre}</p>
                          {ep.duree && <p className="text-[11px] text-warm/25">{ep.duree} min</p>}
                        </div>
                        {active && (
                          <span className="shrink-0 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5 text-white ml-0.5"><path d="M8 5v14l11-7z"/></svg>
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Films similaires ─────────────────────────────────────── */}
        <SimilarFilms media={media} allMedia={allMedia} />
      </div>
    </div>
  )
}
