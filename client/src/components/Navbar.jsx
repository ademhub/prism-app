import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'

const NAV_GENRES = [
  { label: 'Action',      q: 'Action' },
  { label: 'Sci-Fi',      q: 'Science-Fiction' },
  { label: 'Animation',   q: 'Animation' },
  { label: 'Horreur',     q: 'Horreur' },
  { label: 'Thriller',    q: 'Thriller' },
  { label: 'Comédie',     q: 'Comédie' },
]

export default function Navbar() {
  const [scrolled, setScrolled]     = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchParams]              = useSearchParams()
  const navigate                    = useNavigate()

  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  useEffect(() => { setQuery(searchParams.get('q') ?? '') }, [searchParams])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handleChange = (val) => {
    setQuery(val)
    navigate(val.trim() ? `/?q=${encodeURIComponent(val.trim())}` : '/', { replace: true })
  }

  const currentQ = searchParams.get('q') ?? ''

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 h-16 flex items-center transition-all duration-500 ${
        scrolled
          ? 'bg-surface/96 backdrop-blur-md shadow-[0_1px_0_rgba(255,255,255,0.04)]'
          : 'bg-gradient-to-b from-black/80 to-transparent'
      }`}
    >
      <div className="w-full px-10 flex items-center gap-6">
        {/* Logo */}
        <Link
          to="/"
          onClick={() => handleChange('')}
          className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity"
        >
          <span className="font-display text-sm tracking-[0.22em] text-warm leading-none">PRISM</span>
        </Link>

        {/* Nav links */}
        <div className="hidden md:flex items-center gap-0.5 text-sm">
          <NavLink to="/" active={!currentQ} onClick={() => handleChange('')}>
            Accueil
          </NavLink>
          {NAV_GENRES.map(({ label, q }) => (
            <NavLink
              key={q}
              to={`/?q=${encodeURIComponent(q)}`}
              active={currentQ === q}
            >
              {label}
            </NavLink>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Search */}
        <div className={`flex items-center transition-all duration-300 ${searchOpen ? 'w-64' : 'w-8'}`}>
          {searchOpen ? (
            <div className="relative w-full">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-warm/40 text-sm select-none pointer-events-none">⌕</span>
              <input
                type="search"
                value={query}
                placeholder="Titre, genre, acteur…"
                autoFocus
                onChange={(e) => handleChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { handleChange(''); setSearchOpen(false) }
                }}
                onBlur={() => { if (!query) setSearchOpen(false) }}
                className="w-full bg-white/8 rounded-full pl-8 pr-4 py-1.5 text-sm text-warm placeholder-warm/35 border border-white/12 focus:outline-none focus:border-accent/50 focus:bg-white/12 transition-all"
              />
              {query && (
                <button
                  onMouseDown={() => { handleChange(''); setSearchOpen(false) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-warm/30 hover:text-warm/70 text-xs transition-colors"
                >✕</button>
              )}
            </div>
          ) : (
            <button
              onClick={() => setSearchOpen(true)}
              className="w-8 h-8 flex items-center justify-center text-warm/60 hover:text-warm transition-colors text-lg"
            >
              ⌕
            </button>
          )}
        </div>

        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-surface text-sm font-bold shrink-0 cursor-pointer hover:scale-105 transition-transform shadow-[0_0_0_2px_rgba(240,169,62,0.2)]">
          A
        </div>
      </div>
    </nav>
  )
}

function NavLink({ to, children, onClick, active }) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
        active
          ? 'text-warm bg-white/8 border border-white/10'
          : 'text-warm/55 hover:text-warm/90 hover:bg-white/6'
      }`}
    >
      {children}
    </Link>
  )
}
