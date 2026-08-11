import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import CircularGallery from '../components/CircularGallery'
import { CoverflowCarousel } from '../components/CoverflowCarousel'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { getMedia, getProgress, getCollections, img } from '../api'
import MediaRow from '../components/MediaRow'
import MediaCard from '../components/MediaCard'
import { useFavorites } from '../context/FavoritesContext'
import { detectSagas } from '../lib/sagas'

// ── Constantes ────────────────────────────────────────────────────────────────

const GENRE_ORDER = [
  'Action', 'Thriller', 'Science-Fiction', 'Horreur', 'Animation',
  'Comédie', 'Aventure', 'Crime', 'Familial', 'Documentaire',
  'Romance', 'Fantastique', 'Histoire', 'Musique', 'Guerre', 'Western', 'Drame',
  'Action & Adventure', 'Science-Fiction & Fantastique', 'War & Politics',
]
const SKIP_GENRES = new Set(['Téléfilm', 'Kids', 'Reality', 'Talk'])
const ROW_LIMIT   = 25
const CURRENT_YEAR = new Date().getFullYear()

// ── Top 10 curatés du moment ─────────────────────────────────────────────────

const ASIAN_LANGS = new Set(['ja', 'ko', 'zh', 'cn', 'th'])

const CURATED_TOP10 = [
  { label: "L'Odyssée",                                 test: (t, m) => m.tmdb_id === 1368337 },
  { label: 'Spider-Man: Brand New Day',                 test: (t, m) => m.tmdb_id === 969681 },
  { label: 'Obsession',                                 test: (t, m) => m.tmdb_id === 1339713 },
  { label: 'Superman',                                  test: (t, m) => m.tmdb_id === 1061474 },
  { label: 'Des Minions et des monstres',               test: (t, m) => m.tmdb_id === 1315772 },
  { label: 'F1',                                        test: (t, m) => m.tmdb_id === 911430 },
  { label: 'Mission: Impossible - The Final Reckoning', test: (t, m) => m.tmdb_id === 575265 },
  { label: 'Sinners',                                   test: (t, m) => m.tmdb_id === 1233413 },
  { label: 'How to Train Your Dragon',                  test: (t, m) => m.tmdb_id === 1087192 },
  { label: 'Deadpool & Wolverine',                      test: (t, m) => m.tmdb_id === 533535 },
]

function getCuratedTop10(list) {
  return CURATED_TOP10.flatMap(({ test }) => {
    const match = list.find((m) => {
      const t = m.titre_officiel || m.titre_brut || ''
      return test(t, m)
    })
    return match ? [match] : []
  })
}

const isWestern = (m) => !ASIAN_LANGS.has(m.original_language)

function getNewReleases(list) {
  return [...list]
    .filter((m) => isWestern(m) && m.annee_devinee >= CURRENT_YEAR - 2 && m.poster_path && (m.titre_officiel || m.titre_brut))
    .sort((a, b) => (b.annee_devinee - a.annee_devinee) || (b.note - a.note))
    .slice(0, ROW_LIMIT)
}

function getEnCeMoment(list) {
  return [...list]
    .filter((m) => isWestern(m) && m.annee_devinee >= 2024 && m.poster_path && (m.titre_officiel || m.titre_brut))
    .sort((a, b) => (b.annee_devinee - a.annee_devinee) || (b.note - a.note))
    .slice(0, ROW_LIMIT)
}

function getPopularSeries(list) {
  return [...list]
    .filter((m) => isWestern(m) && m.media_type === 'tv' && m.poster_path && (m.titre_officiel || m.titre_brut))
    .sort((a, b) => (b.note ?? 0) - (a.note ?? 0) || (b.annee_devinee ?? 0) - (a.annee_devinee ?? 0))
    .slice(0, ROW_LIMIT)
}

function getRecentSeries(list) {
  return [...list]
    .filter((m) => isWestern(m) && m.media_type === 'tv' && m.poster_path && (m.titre_officiel || m.titre_brut) && m.annee_devinee >= 2022)
    .sort((a, b) => (b.annee_devinee ?? 0) - (a.annee_devinee ?? 0) || (b.note ?? 0) - (a.note ?? 0))
    .slice(0, ROW_LIMIT)
}

function getFeatured(list) {
  return [...list]
    .filter((m) =>
      isWestern(m) &&
      m.backdrop_path &&
      m.poster_path &&
      m.annee_devinee >= 2023 &&
      (m.note >= 5 || !m.note) &&
      (m.titre_officiel || m.titre_brut)
    )
    .sort((a, b) => (b.annee_devinee - a.annee_devinee) || (b.note - a.note))
    .slice(0, 12)
}

function groupByGenre(list) {
  const map  = new Map()
  const seen = new Set()

  const sorted = [...list]
    .filter((m) => isWestern(m) && m.poster_path && (m.titre_officiel || m.titre_brut))
    .sort((a, b) => {
      const yearDiff = (b.annee_devinee ?? 0) - (a.annee_devinee ?? 0)
      if (yearDiff !== 0) return yearDiff
      return (b.note ?? 0) - (a.note ?? 0)
    })

  for (const item of sorted) {
    for (const genre of item.genres ?? []) {
      if (SKIP_GENRES.has(genre)) continue
      if (!map.has(genre)) map.set(genre, [])
      const arr = map.get(genre)
      if (arr.length < ROW_LIMIT && !seen.has(`${genre}:${item.id}`)) {
        arr.push(item)
        seen.add(`${genre}:${item.id}`)
      }
    }
  }
  return map
}

// ── Hero Section ──────────────────────────────────────────────────────────────

const TMDB_IMG = 'https://image.tmdb.org/t/p'

const HERO_ITEMS = [
  { image: `${TMDB_IMG}/w500/6dfr9o52w9AVYJSlSA1IBUlLCyU.jpg`, backdrop: `${TMDB_IMG}/w1280/RMXG8myu1aGlNUsRjtxzmpdMK0.jpg`, text: "L'Odyssée",              link: 43   },
  { image: `${TMDB_IMG}/w500/tV712n7bMaRuaKyltFl65HPNRiP.jpg`, text: 'Spider-Man : Brand New Day', link: 24   },
  { image: `${TMDB_IMG}/w500/mDCR1frpUvGfIKksuM440VLb7X9.jpg`, text: 'Obsession',                  link: 323  },
  { image: `${TMDB_IMG}/w500/9ZmdDOIbiFCZOvRXBQ7muWUu32l.jpg`, text: 'Sinners',                    link: 1510 },
  { image: `${TMDB_IMG}/w500/lBT9IItBO0yat1I6EBeIbtl4jIA.jpg`, text: 'Kill Bill',                  link: 4223 },
  { image: `${TMDB_IMG}/w500/up0kyZZlLX24dE9SzDuTjXe6HFl.jpg`, text: 'F1® Le Film',               link: 1324 },
]

const HERO_SLIDES = HERO_ITEMS.map(item => ({ src: item.image, backdrop: item.backdrop ?? item.image, alt: item.text, title: item.text }))

function HeroSection() {
  const navigate = useNavigate()
  const [scrollY, setScrollY] = useState(0)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  const [activeSlide, setActiveSlide] = useState(0)
  const [activeDesktop, setActiveDesktop] = useState(0)

  const handleHeroClick = (idx) => {
    const item = HERO_ITEMS[idx]
    if (item?.link) navigate(`/detail/${item.link}`)
  }

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const progress = Math.min(1, scrollY / (window.innerHeight * 0.8))
  const dark     = progress * 0.45

  return (
    <div className="relative w-full h-dvh overflow-hidden bg-surface">

      {/* Fond dynamique — image du film actif, sombre et agrandie */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {HERO_SLIDES.map((slide, i) => (
          <img
            key={i}
            src={slide.backdrop}
            alt=""
            aria-hidden
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-[1px] transition-opacity duration-1000"
            style={{ opacity: i === (isMobile ? activeSlide : activeDesktop) ? 0.55 : 0 }}
          />
        ))}
        <div className="absolute inset-0 bg-surface/30" />
      </div>

      {/* Contenu — scale + légère descente pour l'effet parallax */}
      <div
        className="absolute inset-0 z-10"
        style={{ transform: `translateY(${scrollY * 0.06}px)` }}
      >
        <div className="absolute top-0 inset-x-0 z-10 pt-10 text-center pointer-events-none select-none">
          <div className="flex items-center justify-center gap-3">
            <img src="/logo-icon-bold.svg?v=8" alt="" className="h-7 w-auto -translate-y-1" />
            <span className="font-display text-2xl tracking-[0.25em] text-warm">PRISM</span>
          </div>
          <p className="mt-2 text-warm/30 text-[9px] tracking-[0.5em] uppercase">
            Tous les films · Une seule plateforme
          </p>
        </div>

        <div className="absolute inset-0 top-16">
          {isMobile ? (
            <div className="flex flex-col items-center justify-center h-full gap-6 pb-10">
              <CoverflowCarousel
                slides={HERO_SLIDES}
                cardWidth="clamp(140px, 38vw, 220px)"
                rotate={44}
                depth={0.55}
                gap={0.1}
                showCaption
                loop
                noDrag
                autoAdvanceMs={10000}
                onSlideChange={setActiveSlide}
                onSlideClick={handleHeroClick}
              />
              <button
                onClick={() => window.scrollBy({ top: window.innerHeight, behavior: 'smooth' })}
                className="relative z-10 flex items-center gap-2 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm px-7 py-3 text-sm font-semibold tracking-widest text-white uppercase hover:bg-white/20 transition-all active:scale-95"
              >
                Découvrir
                <svg xmlns="http://www.w3.org/2000/svg" className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12l7 7 7-7"/>
                </svg>
              </button>
            </div>
          ) : (
            <CircularGallery
              items={HERO_ITEMS}
              bend={3}
              borderRadius={0.05}
              scrollSpeed={2}
              scrollEase={0.05}
              noScroll
              noDrag
              autoSpeed={0.006}
              onCenterChange={setActiveDesktop}
              onItemClick={handleHeroClick}
            />
          )}
        </div>
      </div>

      {/* Overlay sombre au scroll */}
      <div
        className="absolute inset-0 pointer-events-none z-20"
        style={{ background: `rgba(0,0,0,${dark})` }}
      />
      <div className="absolute bottom-0 inset-x-0 h-44 z-20 bg-gradient-to-t from-surface to-transparent pointer-events-none" />
    </div>
  )
}

// ── Top 10 Card ───────────────────────────────────────────────────────────────

function Top10Card({ media, index }) {
  const rank   = index + 1
  const titre  = media.titre_officiel || media.titre_brut
  const poster = img(media.poster_path, 'w342')

  const inner = (
    <>
      <div className="absolute left-0 bottom-[3px] z-0 leading-none select-none pointer-events-none">
        <span className="font-display leading-none"
          style={{ fontSize: rank < 10 ? '7rem' : '5.8rem', color: 'transparent', WebkitTextStroke: '2.5px rgba(255,255,255,0.12)' }}>
          {rank}
        </span>
      </div>
      <div className="relative z-10 w-20 md:w-28 aspect-[2/3] rounded-xl overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.6)]">
        {poster ? (
          <img src={poster} alt={titre} loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
        ) : (
          <div className="w-full h-full bg-surface-2 flex items-center justify-center px-2">
            <span className="font-display text-warm/20 text-xs text-center leading-tight">{titre}</span>
          </div>
        )}
        {media.id && (
          <div className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <div className="w-10 h-10 rounded-full bg-white/20 border border-white/30 flex items-center justify-center">
              <span className="text-white text-sm ml-0.5">▶</span>
            </div>
          </div>
        )}
      </div>
      <div className="absolute -bottom-7 left-0 right-0 px-1 z-10">
        <p className="text-warm/60 text-[10px] line-clamp-1">{titre}</p>
      </div>
    </>
  )

  const cls = "group relative flex items-end shrink-0 select-none"
  const style = { paddingLeft: rank < 10 ? '3.2rem' : '4rem' }

  return media.id
    ? <Link to={`/media/${media.id}`} className={`${cls} cursor-pointer`} style={style}>{inner}</Link>
    : <div className={`${cls} opacity-60`} style={style}>{inner}</div>
}

// ── Carte "Continuer à regarder" ─────────────────────────────────────────────

function ContinueCard({ media }) {
  return <MediaCard media={media} progress={media.position_secondes} />
}

function getInProgress(progressList) {
  return progressList
    .filter((p) => {
      if (!p.duree) return true
      const pct = p.position_secondes / (p.duree * 60)
      return pct > 0.02 && pct < 0.85
    })
    .slice(0, 12)
}

function getRecommendations(progressList, allMedia) {
  const genreCounts = {}
  const watchedIds = new Set(progressList.map((p) => p.media_id ?? p.id))
  for (const p of progressList) {
    for (const g of p.genres ?? []) genreCounts[g] = (genreCounts[g] ?? 0) + 1
  }
  const topGenres = Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g)
  if (!topGenres.length) return { films: [], genres: [] }
  const films = allMedia
    .filter((m) => !watchedIds.has(m.id) && m.poster_path && (m.titre_officiel || m.titre_brut))
    .filter((m) => (m.genres ?? []).some((g) => topGenres.includes(g)))
    .sort((a, b) => (b.note ?? 0) - (a.note ?? 0))
    .slice(0, 25)
  return { films, genres: topGenres }
}

// ── Écran de chargement ───────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <img src="/logo-icon-bold.svg?v=8" alt="Prism" className="w-16 h-16 animate-pulse" />
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-accent/50 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Résultats de recherche ────────────────────────────────────────────────────

const ALL_GENRES = [
  'Action', 'Thriller', 'Science-Fiction', 'Horreur', 'Animation', 'Comédie',
  'Aventure', 'Crime', 'Familial', 'Documentaire', 'Romance', 'Fantastique',
  'Histoire', 'Musique', 'Guerre', 'Western', 'Drame',
]

function SearchResults({ query, results, rawQuery }) {
  const isGenre = ALL_GENRES.some((g) => g.toLowerCase() === query)
  const matchedGenre = isGenre ? ALL_GENRES.find((g) => g.toLowerCase() === query) : null

  return (
    <main className="pt-8 pb-32 px-4 md:px-10 animate-fade-in">
      <div className="mb-8">
        {matchedGenre ? (
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-3xl tracking-widest text-warm uppercase">{matchedGenre}</h1>
            <span className="text-warm/35 text-sm">{results.length} film{results.length > 1 ? 's' : ''}</span>
          </div>
        ) : (
          <p className="text-warm/40 text-sm">
            {results.length
              ? <><span className="text-warm/80 font-semibold">{results.length}</span> résultat{results.length > 1 ? 's' : ''} pour </>
              : 'Aucun résultat pour '}
            <span className="text-accent">« {rawQuery} »</span>
          </p>
        )}
      </div>

      {results.length === 0 ? (
        <p className="font-display text-3xl text-warm/8 text-center mt-24 tracking-widest">
          AUCUN RÉSULTAT
        </p>
      ) : (
        <div className="flex flex-wrap gap-4">
          {results.map((m, i) => (
            <MediaCard key={m.id} media={m} index={i} />
          ))}
        </div>
      )}
    </main>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────


export default function Home() {
  const [allMedia, setAllMedia]       = useState([])
  const [progressList, setProgress]   = useState([])
  const [collections, setCollections] = useState([])
  const [loading, setLoading]         = useState(true)
  const [selectedSaga, setSelectedSaga] = useState(null)
  const [searchParams]                = useSearchParams()
  const { ids: favIds }               = useFavorites()

  const query    = (searchParams.get('q') ?? '').trim().toLowerCase()
  const rawQuery = searchParams.get('q') ?? ''

  useEffect(() => {
    window.scrollTo(0, 0)
    getMedia()
      .then((mediaData) => { setAllMedia(mediaData); setLoading(false) })
      .catch(() => setLoading(false))

    getProgress().then(setProgress).catch(() => {})
    getCollections().then(setCollections).catch(() => {})
  }, [])

  const favorites = useMemo(
    () => allMedia.filter((m) => favIds.includes(m.id)),
    [allMedia, favIds]
  )

  // Home = vitrine films : les séries restent dans leurs 2 rangées dédiées
  const movies = allMedia.filter((m) => m.media_type !== 'tv')


  if (loading) return <LoadingScreen />

  if (!allMedia.length) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-4">
        <img src="/logo-icon-bold.svg?v=8" alt="Prism" className="w-16 h-16 opacity-30 mb-2" />
        <p className="text-warm/50">Bibliothèque vide.</p>
      </div>
    )
  }

  // Mode recherche
  if (query) {
    const results = movies
      .filter((m) => {
        const titleHay = `${m.titre_officiel ?? ''} ${m.titre_brut ?? ''}`.toLowerCase()
        const genreHay = (m.genres ?? []).join(' ').toLowerCase()
        return titleHay.includes(query) || genreHay.includes(query)
      })
      .sort((a, b) => b.note - a.note)
    return <SearchResults query={query} results={results} rawQuery={rawQuery} />
  }

  // Données organisées (mode normal)
  const curatedTop10  = getCuratedTop10(movies).slice(0, 10)
  const newReleases   = getNewReleases(movies)
  const groups        = groupByGenre(movies)
  const sagas         = detectSagas(movies)
  const popularSeries = getPopularSeries(allMedia)
  const recentSeries  = getRecentSeries(allMedia)
  const inProgress    = getInProgress(progressList)
  const { films: recFilms, genres: recGenres } = getRecommendations(progressList, movies)

  return (
    <main>
      <HeroSection />

      <div className="relative z-10 pb-32">
        {/* ── Ma liste ────────────────────────────────────────────────────── */}
        {favorites.length > 0 && (
          <MediaRow title="Ma liste" items={favorites} />
        )}

        {/* ── Continuer à regarder ────────────────────────────────────────── */}
        {inProgress.length > 0 && (
          <MediaRow title="Continuer à regarder" items={inProgress} card={ContinueCard} />
        )}

        {/* ── Recommandations ─────────────────────────────────────────────── */}
        {recFilms.length > 0 && (
          <MediaRow title={`Parce que tu regardes ${recGenres.slice(0, 2).join(' & ')}`} items={recFilms} />
        )}

        {/* ── Top 10 curatés ──────────────────────────────────────────────── */}
        <section className="mb-16 animate-fade-up" style={{ animationDelay: '80ms' }}>
          <h2 className="font-display text-xl tracking-[0.12em] text-warm/85 uppercase px-4 md:px-10 mb-5">
            Top 10 des films qui font le plus envie
          </h2>
          <div className="relative group/row">
            <Top10ScrollRow items={curatedTop10} />
          </div>
        </section>

        {/* ── Sagas & Franchises ───────────────────────────────────────────── */}
        {sagas.length > 0 && (
          <SagaGrid sagas={sagas} collections={collections} onSelect={setSelectedSaga} />
        )}

        {selectedSaga && (
          <SagaOverlay
            saga={selectedSaga}
            collection={collections.find((c) => c.key === selectedSaga.key) ?? null}
            onClose={() => setSelectedSaga(null)}
          />
        )}

        {/* ── Nouveautés ──────────────────────────────────────────────────── */}
        {newReleases.length > 0 && (
          <MediaRow title={`Nouveautés ${CURRENT_YEAR}`} items={newReleases} />
        )}

        {/* ── Séries populaires ───────────────────────────────────────────── */}
        {popularSeries.length > 0 && (
          <MediaRow title="Séries populaires" items={popularSeries} />
        )}

        {/* ── Séries récentes ─────────────────────────────────────────────── */}
        {recentSeries.length > 0 && (
          <MediaRow title="Séries récentes" items={recentSeries} />
        )}

        {/* ── Sections par genre (ordre priorisé) ─────────────────────────── */}
        {GENRE_ORDER.map((genre) => {
          const items = groups.get(genre)
          if (!items?.length) return null
          return <MediaRow key={genre} title={genre} items={items} />
        })}

        {/* Genres non priorisés */}
        {[...groups.entries()]
          .filter(([g]) => !GENRE_ORDER.includes(g) && !SKIP_GENRES.has(g))
          .map(([genre, items]) => (
            <MediaRow key={genre} title={genre} items={items} />
          ))}
      </div>
    </main>
  )
}

// ── Saga Grid (logos, scroll horizontal) ─────────────────────────────────────

function SagaGrid({ sagas, collections, onSelect }) {
  const rowRef = useRef(null)
  const scroll = (dir) => rowRef.current?.scrollBy({ left: dir * 700, behavior: 'smooth' })

  const collectionMap = useMemo(
    () => new Map(collections.map((c) => [c.key, c])),
    [collections]
  )

  return (
    <section className="mb-10">
      <div className="flex items-center gap-4 mb-5 px-6 lg:px-10">
        <h2 className="font-display text-xl tracking-[0.12em] text-warm/85 uppercase">
          Sagas &amp; Franchises
        </h2>
        <div className="h-px flex-1 bg-gradient-to-r from-accent/30 to-transparent" />
      </div>

      <div className="relative group/sagas">
        <button
          onClick={() => scroll(-1)}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-surface/90 border border-white/10 text-warm flex items-center justify-center opacity-0 group-hover/sagas:opacity-100 hover:bg-accent/90 hover:text-surface hover:border-accent transition-all duration-200 shadow-lg"
        ><ChevronLeft className="size-5" /></button>

        <div ref={rowRef} className="flex gap-4 overflow-x-auto no-scrollbar px-6 lg:px-10 pb-2">
          {sagas.map((saga) => (
            <SagaLogoCard
              key={saga.key}
              saga={saga}
              collection={collectionMap.get(saga.key) ?? null}
              onSelect={onSelect}
            />
          ))}
        </div>

        <button
          onClick={() => scroll(1)}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-surface/90 border border-white/10 text-warm flex items-center justify-center opacity-0 group-hover/sagas:opacity-100 hover:bg-accent/90 hover:text-surface hover:border-accent transition-all duration-200 shadow-lg"
        ><ChevronRight className="size-5" /></button>

        <div className="absolute left-0 top-0 bottom-2 w-12 bg-gradient-to-r from-surface to-transparent pointer-events-none z-10" />
        <div className="absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-surface to-transparent pointer-events-none z-10" />
      </div>
    </section>
  )
}

function SagaLogoCard({ saga, collection, onSelect }) {
  const backdropUrl = collection?.backdrop_path ? img(collection.backdrop_path, 'w780') : null
  const posterUrl   = collection?.poster_path   ? img(collection.poster_path,   'w342') : null

  const { bestBackdrop, bestPoster } = useMemo(() => {
    const sorted = [...saga.movies].sort((a, b) => (b.note ?? 0) - (a.note ?? 0))
    return {
      bestBackdrop: sorted.find((m) => m.backdrop_path),
      bestPoster:   sorted.find((m) => m.poster_path),
    }
  }, [saga.movies])

  const bg     = backdropUrl ?? (bestBackdrop?.backdrop_path ? img(bestBackdrop.backdrop_path, 'w780') : null)
  const poster = posterUrl   ?? (bestPoster?.poster_path     ? img(bestPoster.poster_path,     'w342') : null)

  return (
    <button
      onClick={() => onSelect(saga)}
      className="group relative shrink-0 w-72 aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 cursor-pointer shadow-[0_4px_24px_rgba(0,0,0,0.5)] text-left"
      style={{ background: '#0d0d0d' }}
    >
      {/* Image de fond */}
      {bg ? (
        <img
          src={bg}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:opacity-65 scale-105 group-hover:scale-110 transition-all duration-700 pointer-events-none select-none"
        />
      ) : poster ? (
        <img
          src={poster}
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-top opacity-35 group-hover:opacity-50 scale-105 group-hover:scale-110 transition-all duration-700 pointer-events-none select-none"
        />
      ) : null}

      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-black/25 pointer-events-none" />

      {/* Logo — taille uniforme via conteneur fixe */}
      <div className="absolute inset-0 flex items-center justify-center z-10">
        <div className={`flex items-center justify-center ${saga.key === 'fast' ? 'w-64 h-28' : 'w-48 h-16'}`}>
          <img
            src={`/logos/${saga.key}.png`}
            alt={saga.name}
            loading="lazy"
            className="max-h-full max-w-full object-contain drop-shadow-[0_0_16px_rgba(0,0,0,0.9)] group-hover:scale-110 transition-transform duration-300"
          />
        </div>
      </div>

      {/* Bas de la card */}
      <div className="absolute bottom-0 left-0 right-0 px-4 py-2.5 z-10 flex items-center justify-between">
        <span className="text-[11px] text-warm/45 group-hover:text-warm/75 transition-colors">
          {saga.count} film{saga.count > 1 ? 's' : ''}
        </span>
        {saga.maxYear >= 2024 && (
          <span className="text-[10px] bg-accent/20 text-accent border border-accent/30 px-1.5 py-0.5 rounded-full font-semibold">
            {saga.maxYear}
          </span>
        )}
      </div>

      <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/0 group-hover:ring-accent/50 transition-all duration-300 pointer-events-none" />
    </button>
  )
}

// ── Overlay saga (superposé sur la home) ──────────────────────────────────────

function SagaOverlay({ saga, collection, onClose }) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const t = requestAnimationFrame(() => setShow(true))
    document.body.style.overflow = 'hidden'
    const onKey = (e) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(t)
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  function handleClose() {
    setShow(false)
    setTimeout(onClose, 350)
  }

  const backdropUrl = collection?.backdrop_path
    ? img(collection.backdrop_path, 'w1280')
    : saga.movies.find((m) => m.backdrop_path)?.backdrop_path
      ? img(saga.movies.find((m) => m.backdrop_path).backdrop_path, 'w1280')
      : null

  return (
    <>
      {/* Fond sombre cliquable */}
      <div
        onClick={handleClose}
        className="fixed inset-0 z-40 flex items-center justify-center"
        style={{
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(6px)',
          opacity: show ? 1 : 0,
          transition: 'opacity 0.3s ease',
        }}
      >
        {/* Modal centré */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="relative w-[min(92vw,960px)] max-h-[60vh] bg-surface rounded-3xl overflow-hidden flex flex-col shadow-2xl"
          style={{
            transform: show ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(24px)',
            opacity: show ? 1 : 0,
            transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.3s ease',
          }}
        >
        {/* Bouton fermer — toujours visible en haut à droite du modal */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 z-50 w-8 h-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center hover:bg-white/20 transition-colors"
        >
          <span className="text-warm text-sm leading-none">✕</span>
        </button>

        {/* Contenu scrollable */}
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {/* Hero */}
          <div className="relative h-48 md:h-60 overflow-hidden shrink-0">
            {backdropUrl && (
              <img src={backdropUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-45" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/50 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-surface/30 to-transparent" />

            <div className="absolute bottom-5 left-8 flex flex-col gap-2">
              <img
                src={`/logos/${saga.key}.png`}
                alt={saga.name}
                className="h-14 w-auto object-contain object-left drop-shadow-[0_0_12px_rgba(0,0,0,1)]"
              />
              <span className="text-warm/40 text-sm">{saga.movies.length} film{saga.movies.length > 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Grille de films */}
          <div className="px-6 md:px-10 pt-6 pb-8">
            <div className="flex flex-wrap gap-4">
              {saga.movies.map((m) => (
                <MediaCard key={m.id} media={m} />
              ))}
            </div>
          </div>
        </div>
        </div>
      </div>
    </>
  )
}

// ── Top10 scroll row ──────────────────────────────────────────────────────────

function Top10ScrollRow({ items }) {
  const rowRef = useRef(null)
  const scroll = (dir) => rowRef.current?.scrollBy({ left: dir * 600, behavior: 'smooth' })

  return (
    <div className="relative group/top">
      <button
        onClick={() => scroll(-1)}
        className="absolute left-3 top-[42%] -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-surface/90 border border-white/10 text-warm flex items-center justify-center opacity-0 group-hover/top:opacity-100 hover:bg-accent/90 hover:text-surface hover:border-accent hover:scale-105 transition-all duration-200 shadow-lg"
      >
        <ChevronLeft className="size-5" />
      </button>

      <div
        ref={rowRef}
        className="flex gap-2 overflow-x-auto no-scrollbar px-4 md:px-10 pb-10"
      >
        {items.map((m, i) => (
          <Top10Card key={m.id} media={m} index={i} />
        ))}
      </div>

      <button
        onClick={() => scroll(1)}
        className="absolute right-3 top-[42%] -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-surface/90 border border-white/10 text-warm flex items-center justify-center opacity-0 group-hover/top:opacity-100 hover:bg-accent/90 hover:text-surface hover:border-accent hover:scale-105 transition-all duration-200 shadow-lg"
      >
        <ChevronRight className="size-5" />
      </button>

      <div className="absolute left-0 top-0 bottom-10 w-10 bg-gradient-to-r from-surface to-transparent pointer-events-none z-10" />
      <div className="absolute right-0 top-0 bottom-10 w-10 bg-gradient-to-l from-surface to-transparent pointer-events-none z-10" />
    </div>
  )
}
