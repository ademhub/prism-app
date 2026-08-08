import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getMedia } from '../api'
import MediaCard from '../components/MediaCard'
import { SAGA_PATTERNS, titleMatchesSaga } from '../lib/sagas'

// ── Constantes ────────────────────────────────────────────────────────────────

const GENRES = [
  'Action', 'Thriller', 'Science-Fiction', 'Horreur', 'Animation',
  'Comédie', 'Aventure', 'Crime', 'Familial', 'Documentaire',
  'Romance', 'Fantastique', 'Histoire', 'Musique', 'Guerre', 'Western', 'Drame',
]

const NOTE_TIERS = [
  { key: 'masterpiece', label: "Chef-d'œuvre", min: 8,   max: 10,  color: '#FFD700' },
  { key: 'excellent',   label: 'Excellent',    min: 7,   max: 7.99, color: '#E50914' },
  { key: 'good',        label: 'Bon',          min: 6,   max: 6.99, color: '#E50914' },
  { key: 'average',     label: 'Passable',     min: 0.1, max: 5.99, color: '#666' },
]

const DECADE_TAGS = [
  { key: '2020s', label: '2020+',       min: 2020, max: 9999 },
  { key: '2010s', label: 'Années 2010', min: 2010, max: 2019 },
  { key: '2000s', label: 'Années 2000', min: 2000, max: 2009 },
  { key: '1990s', label: 'Années 90',   min: 1990, max: 1999 },
  { key: 'old',   label: 'Classiques',  min: 0,    max: 1989 },
]

const DURATION_TAGS = [
  { key: 'short',  label: 'Court  < 90 min',  min: 1,   max: 89   },
  { key: 'medium', label: 'Moyen  90–150 min', min: 90,  max: 150  },
  { key: 'long',   label: 'Long   > 150 min',  min: 151, max: 9999 },
]

const SORT_OPTIONS = [
  { value: 'note', label: 'Mieux notés'  },
  { value: 'year', label: 'Plus récents' },
  { value: 'az',   label: 'A → Z'        },
  { value: 'dur',  label: 'Durée ↑'      },
]

const PAGE_SIZE = 80

// ── Helpers ───────────────────────────────────────────────────────────────────

function getFilmSaga(titre) {
  if (!titre) return null
  for (const s of SAGA_PATTERNS) {
    if (titleMatchesSaga(titre, s.patterns)) return s.key
  }
  return null
}

function applyFilters(list, tags) {
  if (!tags.length) return list
  const byType = {}
  for (const t of tags) {
    ;(byType[t.type] ??= []).push(t)
  }
  return list.filter((m) => {
    for (const [type, group] of Object.entries(byType)) {
      const ok = group.some((tag) => {
        const titre = m.titre_officiel || m.titre_brut || ''
        if (type === 'genre')    return (m.genres ?? []).includes(tag.value)
        if (type === 'note')     return (m.note ?? 0) >= tag.meta.min && (m.note ?? 0) <= tag.meta.max
        if (type === 'decade')   return (m.annee_devinee ?? 0) >= tag.meta.min && (m.annee_devinee ?? 0) <= tag.meta.max
        if (type === 'duration') return (m.duree ?? 0) >= tag.meta.min && (m.duree ?? 0) <= tag.meta.max
        if (type === 'saga')     return getFilmSaga(titre) === tag.value
        return false
      })
      if (!ok) return false
    }
    return true
  })
}

function sortList(list, sortBy) {
  const copy = [...list]
  if (sortBy === 'note') copy.sort((a, b) => (b.note ?? 0) - (a.note ?? 0))
  if (sortBy === 'year') copy.sort((a, b) => (b.annee_devinee ?? 0) - (a.annee_devinee ?? 0))
  if (sortBy === 'az')   copy.sort((a, b) => (a.titre_officiel || a.titre_brut || '').localeCompare(b.titre_officiel || b.titre_brut || ''))
  if (sortBy === 'dur')  copy.sort((a, b) => (a.duree ?? 0) - (b.duree ?? 0))
  return copy
}

// ── Composants ────────────────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-white/6 pb-3 mb-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full mb-2 group"
      >
        <span className="text-[10px] uppercase tracking-[0.18em] text-warm/35 font-semibold group-hover:text-warm/55 transition-colors">
          {title}
        </span>
        <span className={`text-warm/25 text-[10px] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && children}
    </div>
  )
}

function Chip({ label, active, onClick, color }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-100 ${
        active ? 'font-semibold' : 'bg-white/4 text-warm/45 hover:bg-white/8 hover:text-warm'
      }`}
      style={active ? { backgroundColor: color ?? '#E50914', color: '#000' } : {}}
    >
      {label}
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Browse() {
  const [allMedia, setAllMedia]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [activeTags, setActiveTags] = useState([])
  const [sortBy, setSortBy]         = useState('note')
  const [search, setSearch]         = useState('')
  const [page, setPage]             = useState(1)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const topRef                      = useRef(null)

  useEffect(() => {
    getMedia().then((data) => {
      setAllMedia(data.filter((m) => m.poster_path && (m.titre_officiel || m.titre_brut)))
    }).finally(() => setLoading(false))
  }, [])

  // Reset pagination on filter/sort change
  useEffect(() => { setPage(1) }, [activeTags, sortBy, search])

  const presentSagas = useMemo(() => {
    const seen = new Set()
    for (const m of allMedia) {
      const key = getFilmSaga(m.titre_officiel || m.titre_brut || '')
      if (key) seen.add(key)
    }
    return SAGA_PATTERNS.filter((s) => seen.has(s.key))
  }, [allMedia])

  const toggle = (tag) => {
    setActiveTags((prev) => {
      const exists = prev.some((t) => t.type === tag.type && t.value === tag.value)
      return exists
        ? prev.filter((t) => !(t.type === tag.type && t.value === tag.value))
        : [...prev, tag]
    })
  }

  const isOn = (type, value) => activeTags.some((t) => t.type === type && t.value === value)

  const filtered = useMemo(
    () => sortList(applyFilters(allMedia, activeTags).filter((m) => {
      if (!search.trim()) return true
      const q = search.trim().toLowerCase()
      return `${m.titre_officiel ?? ''} ${m.titre_brut ?? ''}`.toLowerCase().includes(q)
    }), sortBy),
    [allMedia, activeTags, sortBy, search]
  )

  const visible  = filtered.slice(0, page * PAGE_SIZE)
  const hasMore  = visible.length < filtered.length

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <img src="/logo-icon-bold.svg?v=8" alt="Prism" className="w-16 h-16 animate-pulse" />
    </div>
  )

  const SidebarContent = () => (
    <>
      <div className="flex items-center justify-between mb-5">
        <p className="font-display text-xl text-warm tracking-widest">EXPLORER</p>
        <button onClick={() => setSidebarOpen(false)}
          className="lg:hidden text-warm/30 hover:text-warm text-sm transition-colors p-1">✕</button>
      </div>

      <Link to="/" onClick={() => setSidebarOpen(false)}
        className="block text-warm/30 hover:text-warm text-[11px] mb-5 transition-colors">← Accueil</Link>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Filtrer par titre…"
        className="w-full mb-5 bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-xs text-warm placeholder-warm/20 focus:outline-none focus:border-accent/40 transition-colors"
      />

      <Section title="Genre">
        <div className="flex flex-col gap-0.5">
          {GENRES.map((g) => (
            <Chip key={g} label={g} active={isOn('genre', g)}
              onClick={() => toggle({ type: 'genre', value: g, label: g })} />
          ))}
        </div>
      </Section>

      <Section title="Note">
        <div className="flex flex-col gap-0.5">
          {NOTE_TIERS.map((t) => (
            <Chip key={t.key} label={`${t.label} ★${t.min}+`} color={t.color}
              active={isOn('note', t.key)}
              onClick={() => toggle({ type: 'note', value: t.key, label: t.label, meta: t })} />
          ))}
        </div>
      </Section>

      <Section title="Époque">
        <div className="flex flex-col gap-0.5">
          {DECADE_TAGS.map((d) => (
            <Chip key={d.key} label={d.label} active={isOn('decade', d.key)}
              onClick={() => toggle({ type: 'decade', value: d.key, label: d.label, meta: d })} />
          ))}
        </div>
      </Section>

      <Section title="Durée">
        <div className="flex flex-col gap-0.5">
          {DURATION_TAGS.map((d) => (
            <Chip key={d.key} label={d.label} active={isOn('duration', d.key)}
              onClick={() => toggle({ type: 'duration', value: d.key, label: d.label, meta: d })} />
          ))}
        </div>
      </Section>

      {presentSagas.length > 0 && (
        <Section title="Saga" defaultOpen={false}>
          <div className="flex flex-col gap-0.5">
            {presentSagas.map((s) => (
              <Chip key={s.key} label={s.name} active={isOn('saga', s.key)}
                onClick={() => toggle({ type: 'saga', value: s.key, label: s.name })} />
            ))}
          </div>
        </Section>
      )}
    </>
  )

  return (
    <div className="flex min-h-screen" ref={topRef}>

      {/* ── Backdrop mobile ─────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar desktop (sticky) ─────────────────────────────────────── */}
      <aside className="hidden lg:block w-56 shrink-0 sticky top-0 h-screen overflow-y-auto no-scrollbar bg-surface border-r border-white/5 pt-6 pb-28 px-4">
        <SidebarContent />
      </aside>

      {/* ── Sidebar mobile (drawer) ──────────────────────────────────────── */}
      <aside className={`lg:hidden fixed top-0 left-0 h-full w-72 z-40 bg-surface border-r border-white/8 overflow-y-auto no-scrollbar pt-6 pb-28 px-5 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <SidebarContent />
      </aside>

      {/* ── Résultats ───────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 pt-6 pb-32 px-4 sm:px-6 lg:px-8">

        {/* Bouton filtres (mobile) + tags actifs + tri */}
        <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">

          <div className="flex flex-wrap gap-2 items-center min-h-[28px]">
            {/* Bouton filtres mobile */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/8 border border-white/12 text-warm/60 text-[11px] hover:bg-white/12 hover:text-warm transition-all"
            >
              ⚙ Filtres
              {activeTags.length > 0 && (
                <span className="bg-accent text-white text-[9px] font-bold rounded-full px-1.5 leading-tight">{activeTags.length}</span>
              )}
            </button>

            {activeTags.length === 0
              ? <span className="text-warm/20 text-xs hidden lg:inline">Tous les films · {filtered.length}</span>
              : (
                <>
                  {activeTags.map((tag) => (
                    <button key={`${tag.type}-${tag.value}`}
                      onClick={() => toggle(tag)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent/15 border border-accent/25 text-accent text-[11px] hover:bg-accent/25 transition-colors"
                    >
                      {tag.label} <span className="text-accent/50 text-[9px]">✕</span>
                    </button>
                  ))}
                  <button onClick={() => setActiveTags([])}
                    className="text-warm/25 text-[11px] hover:text-warm/50 transition-colors">
                    Tout effacer
                  </button>
                  <span className="text-warm/20 text-[11px]">· {filtered.length}</span>
                </>
              )
            }
          </div>

          <div className="flex gap-1 shrink-0 flex-wrap">
            {SORT_OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => setSortBy(opt.value)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                  sortBy === opt.value ? 'bg-accent text-white' : 'bg-white/5 text-warm/35 hover:text-warm hover:bg-white/8'
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Grille */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <p className="font-display text-3xl text-warm/8 tracking-widest">AUCUN RÉSULTAT</p>
            <button onClick={() => { setActiveTags([]); setSearch('') }}
              className="text-accent text-sm hover:underline">
              Réinitialiser
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {visible.map((m, i) => <MediaCard key={m.id} media={m} index={i % PAGE_SIZE} fluid />)}
            </div>
            {hasMore && (
              <div className="flex justify-center mt-10">
                <button
                  onClick={() => setPage((p) => p + 1)}
                  className="px-8 py-3 rounded-full bg-white/6 border border-white/10 text-warm/60 text-sm hover:bg-white/10 hover:text-warm transition-all"
                >
                  Charger plus · {filtered.length - visible.length} restants
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
