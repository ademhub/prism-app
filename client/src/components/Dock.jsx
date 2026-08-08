import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Home, Search, LayoutGrid, Compass, Shuffle,
  LogIn, LogOut, User, Settings, Users, Tv, Radio, MessageCircle, UserPlus, Film,
} from 'lucide-react'
import { getMedia, getConversations, getNotifications, markNotificationsRead } from '../api'
import RandomFilmModal from './RandomFilmModal'
import { useAuth } from '../context/AuthContext'

const ICON_SIZE = 40

const ALL_GENRES = [
  'Action', 'Thriller', 'Science-Fiction', 'Horreur', 'Animation',
  'Comédie', 'Aventure', 'Crime', 'Familial', 'Documentaire',
  'Romance', 'Fantastique', 'Histoire', 'Guerre', 'Western', 'Drame',
]

// ── Bouton dock ───────────────────────────────────────────────────────────────
function DockBtn({ children, label, active, onClick, className = '' }) {
  return (
    <div className="relative group flex flex-col items-center justify-end">
      <span className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-lg text-[10px] bg-surface/95 border border-white/10 text-warm/80 whitespace-nowrap pointer-events-none shadow-lg backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        {label}
      </span>

      <motion.button
        onClick={onClick}
        whileTap={{ scale: 0.94 }}
        className={`w-9 h-9 md:w-8 md:h-8 flex items-center justify-center rounded-lg outline-none shrink-0 cursor-pointer transition-colors duration-150 ${
          active
            ? 'bg-white/15 text-accent'
            : 'text-warm/55 hover:bg-white/8 hover:text-warm'
        } ${className}`}
      >
        {children}
      </motion.button>
    </div>
  )
}

// ── Dock principal ────────────────────────────────────────────────────────────
export default function Dock() {
  const [searchOpen, setSearchOpen]   = useState(false)
  const [catsOpen, setCatsOpen]       = useState(false)
  const [randomOpen, setRandomOpen]   = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifs, setNotifs]           = useState([])
  const profileRef                    = useRef(null)
  const [allMedia, setAllMedia]       = useState([])
  const [query, setQuery]             = useState('')
  const searchInputRef                = useRef(null)
  const navigate                      = useNavigate()
  const [searchParams]                = useSearchParams()
  const location                      = useLocation()
  const { user, logout, name, activeProfile, socialProfile, selectProfile } = useAuth()
  const socialId = activeProfile?.id ?? user?.id
  const [unreadCount, setUnreadCount] = useState(0)
  const currentQ   = searchParams.get('q') ?? ''
  const path       = location.pathname
  const isDetail   = path.startsWith('/media/') || path.startsWith('/actor/') || path.startsWith('/saga/')
  const onBrowse   = path === '/browse'
  const onSeries   = path === '/series'
  const onChannels = path === '/channels'
  const onProfile  = path === '/profile'

  // Mémorise la dernière section visitée
  const [lastSection, setLastSection] = useState(() => sessionStorage.getItem('dock_section') ?? 'home')
  useEffect(() => {
    if (isDetail) return
    const section = onSeries ? 'series' : onBrowse ? 'browse' : onChannels ? 'channels' : 'home'
    setLastSection(section)
    sessionStorage.setItem('dock_section', section)
  }, [path])

  useEffect(() => { setQuery(searchParams.get('q') ?? '') }, [searchParams])

  useEffect(() => {
    getMedia().then(setAllMedia).catch(() => {})
  }, [])

  useEffect(() => {
    if (!socialId) return
    const load = () => getConversations(socialId).then((convs) => {
      setUnreadCount(convs.reduce((s, c) => s + (c.unread ?? 0), 0))
    }).catch(() => {})
    load()
    const interval = setInterval(load, 10000)
    // Rafraîchit immédiatement quand une conversation est ouverte
    window.addEventListener('messages-read', load)
    return () => {
      clearInterval(interval)
      window.removeEventListener('messages-read', load)
    }
  }, [socialId])

  useEffect(() => {
    if (!socialId) return
    const load = () => getNotifications(socialId).then(setNotifs).catch(() => {})
    load()
    const interval = setInterval(load, 30000)
    return () => clearInterval(interval)
  }, [socialId])

  const closeAll   = useCallback(() => { setSearchOpen(false); setCatsOpen(false); setRandomOpen(false); setProfileOpen(false) }, [])
  const openSearch = useCallback(() => { setSearchOpen(true);  setCatsOpen(false); setRandomOpen(false); setProfileOpen(false) }, [])
  const openCats   = useCallback(() => { setCatsOpen(true);    setSearchOpen(false); setRandomOpen(false); setProfileOpen(false) }, [])
  const openRandom = useCallback(() => { setRandomOpen(true);  setSearchOpen(false); setCatsOpen(false);  setProfileOpen(false) }, [])

  useEffect(() => {
    if (!profileOpen) return
    const handle = (e) => { if (!profileRef.current?.contains(e.target)) setProfileOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [profileOpen])

  useEffect(() => {
    if (!profileOpen || !socialId) return
    markNotificationsRead(socialId)
      .then(() => setNotifs((n) => n.map((x) => ({ ...x, read: 1 }))))
      .catch(() => {})
  }, [profileOpen, socialId])

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [searchOpen])

  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (e.key === 'Escape') { closeAll(); return }
      if (!typing && (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key === 'k'))) {
        e.preventDefault()
        searchOpen ? closeAll() : openSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchOpen, openSearch, closeAll])

  const handleSearch = (val) => {
    setQuery(val)
    navigate(val.trim() ? `/?q=${encodeURIComponent(val.trim())}` : '/', { replace: true })
  }

  const handleHome = () => { navigate('/'); setQuery(''); closeAll() }

  const activeHome     = isDetail ? lastSection === 'home'     : path === '/'
  const activeSeries   = isDetail ? lastSection === 'series'   : onSeries
  const activeChannels = isDetail ? lastSection === 'channels' : onChannels

  return (
    <>
      <div className="fixed bottom-0 inset-x-0 h-36 bg-gradient-to-t from-surface via-surface/60 to-transparent pointer-events-none z-[300]" />

      {randomOpen && allMedia.length > 0 && (
        <RandomFilmModal allMedia={allMedia} onClose={closeAll} />
      )}

      {/* Overlay fermeture au clic extérieur */}
      {(searchOpen || catsOpen) && (
        <div className="fixed inset-0 z-40" onMouseDown={closeAll} />
      )}

      <AnimatePresence>
        {/* Panneau recherche */}
        {searchOpen && (
          <motion.div key="search"
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className="fixed bottom-[5.5rem] left-1/2 -translate-x-1/2 z-[300] w-[calc(100vw-2rem)] sm:w-80"
          >
            <div className="relative bg-surface/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-warm/40 text-base select-none pointer-events-none">⌕</span>
              <input ref={searchInputRef} type="search" value={query}
                placeholder="Titre, genre… (/ ou Ctrl+K)"
                onChange={(e) => handleSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { handleSearch(''); closeAll() } }}
                className="w-full bg-transparent pl-10 pr-10 py-3.5 text-sm text-warm placeholder-warm/30 focus:outline-none" />
              {query && (
                <button onMouseDown={() => { handleSearch(''); closeAll() }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-warm/30 hover:text-warm/70 text-xs transition-colors">
                  ✕
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* Panneau catégories */}
        {catsOpen && (
          <motion.div key="cats"
            initial={{ opacity: 0, y: 10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            className="fixed bottom-[5.5rem] left-1/2 -translate-x-1/2 z-[300]"
          >
            <div className="bg-surface/95 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-3">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                {ALL_GENRES.map((genre) => (
                  <button key={genre}
                    onClick={() => { navigate(`/?q=${encodeURIComponent(genre)}`); closeAll() }}
                    className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 whitespace-nowrap ${
                      currentQ === genre
                        ? 'bg-accent text-surface font-semibold'
                        : 'bg-white/6 text-warm/65 hover:bg-white/12 hover:text-warm'
                    }`}>
                    {genre}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Dock ─────────────────────────────────────────────────────────── */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[300]">
        <div className="flex items-center gap-0.5 p-1.5 px-2 rounded-xl backdrop-blur-xl border border-white/10 bg-surface/80 shadow-[0_8px_40px_rgba(0,0,0,0.6)]">
          <DockBtn label="Accueil" active={activeHome} onClick={handleHome}>
            <Home size={16} />
          </DockBtn>

          <DockBtn label="Rechercher" active={searchOpen} onClick={() => searchOpen ? closeAll() : openSearch()}>
            <Search size={16} />
          </DockBtn>

          <div className="hidden md:block">
            <DockBtn label="Catégories" active={catsOpen} onClick={() => catsOpen ? closeAll() : openCats()}>
              <LayoutGrid size={16} />
            </DockBtn>
          </div>

          <DockBtn label="Explorer" active={onBrowse} onClick={() => { navigate('/browse'); closeAll() }}>
            <Compass size={16} />
          </DockBtn>

          <DockBtn label="Séries" active={activeSeries} onClick={() => { navigate('/series'); closeAll() }}>
            <Tv size={16} />
          </DockBtn>

          <DockBtn label="Chaînes TV" active={activeChannels} onClick={() => { navigate('/channels'); closeAll() }}>
            <Radio size={16} />
          </DockBtn>

          <DockBtn label="Messages" active={path === '/messages'} onClick={() => { navigate('/messages'); closeAll() }}>
            <div className="relative">
              <MessageCircle size={16} />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-accent text-white text-[8px] font-bold flex items-center justify-center leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
          </DockBtn>

          <div className="hidden md:block">
            <DockBtn label="Film au hasard" active={randomOpen} onClick={() => randomOpen ? closeAll() : openRandom()}>
              <Shuffle size={16} />
            </DockBtn>
          </div>

          {/* Séparateur */}
          <div className="w-px self-stretch mx-0.5 bg-white/10 my-1.5" />

          {/* Profil */}
          {activeProfile ? (
            <div className="relative" ref={profileRef}>
              <AnimatePresence>
                {profileOpen && (
                  <motion.div key="profile-menu"
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.96 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-[calc(100%+16px)] right-0 z-50 w-64 rounded-2xl border border-white/10 bg-surface/95 backdrop-blur-xl shadow-2xl overflow-hidden"
                  >
                    <div className="px-4 py-3 border-b border-white/8">
                      <p className="text-warm text-sm font-semibold truncate">{name}</p>
                      <p className="text-warm/35 text-xs truncate">{activeProfile?.email}</p>
                    </div>

                    {/* Notifications */}
                    {notifs.length > 0 && (
                      <div className="border-b border-white/8">
                        <p className="px-4 pt-2.5 pb-1 text-[10px] text-warm/30 uppercase tracking-widest font-semibold">Notifications</p>
                        <div className="max-h-44 overflow-y-auto">
                          {notifs.slice(0, 5).map((n) => {
                            const fromName = n.display_name || n.username || 'Quelqu\'un'
                            let icon, label, to
                            if (n.type === 'friend_request') {
                              icon = <UserPlus size={11} className="text-purple-400 shrink-0" />
                              label = `${fromName} t'a envoyé une demande d'ami`
                              to = '/profile'
                            } else if (n.type === 'share') {
                              let title = ''
                              try { const m = JSON.parse(n.meta); title = m.title || m.name || '' } catch {}
                              icon = <Film size={11} className="text-accent shrink-0" />
                              label = `${fromName} a partagé "${title}" avec toi`
                              to = `/messages?with=${n.from_id}`
                            }
                            if (!to) return null
                            return (
                              <button key={n.id}
                                onClick={() => { navigate(to); setProfileOpen(false) }}
                                className={`w-full flex items-start gap-2 px-4 py-2 text-left hover:bg-white/5 transition-colors ${!n.read ? 'bg-white/3' : ''}`}
                              >
                                <span className="mt-0.5">{icon}</span>
                                <span className="text-warm/60 text-[11px] leading-snug flex-1 min-w-0 line-clamp-2">{label}</span>
                                {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1" />}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <div className="p-1">
                      <button onClick={() => { navigate('/profile'); setProfileOpen(false) }}
                        className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-warm/70 hover:bg-white/6 hover:text-warm transition-colors">
                        <User size={14} /> Mon profil
                      </button>
                      <button onClick={() => { selectProfile(null); setProfileOpen(false) }}
                        className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-warm/70 hover:bg-white/6 hover:text-warm transition-colors">
                        <Users size={14} /> Changer de profil
                      </button>
                      <button onClick={() => { navigate('/profile'); setProfileOpen(false) }}
                        className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-warm/70 hover:bg-white/6 hover:text-warm transition-colors">
                        <Settings size={14} /> Paramètres
                      </button>
                    </div>
                    <div className="border-t border-white/8 p-1">
                      <button onClick={async () => { await logout(); setProfileOpen(false); navigate('/') }}
                        className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-accent/70 hover:bg-accent/8 hover:text-accent transition-colors">
                        <LogOut size={14} /> Déconnexion
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <DockBtn
                label="Compte"
                active={onProfile || profileOpen}
                onClick={() => setProfileOpen(v => !v)}
              >
                <div className="relative">
                  {socialProfile?.avatar_url ? (
                    <img src={socialProfile.avatar_url} alt={name ?? ''}
                      className={`w-5 h-5 rounded-full object-cover border transition-colors ${onProfile || profileOpen ? 'border-white' : 'border-accent/50'}`} />
                  ) : (
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold leading-none transition-colors ${
                      onProfile || profileOpen ? 'bg-white text-accent' : 'bg-accent text-surface'
                    }`}>
                      {name?.[0]?.toUpperCase() ?? 'U'}
                    </div>
                  )}
                  {notifs.some((n) => !n.read) && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 border border-surface" />
                  )}
                </div>
              </DockBtn>
            </div>
          ) : (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => navigate('/login')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent/90 hover:bg-accent text-white text-[11px] font-semibold tracking-wide transition-colors mb-1"
            >
              <LogIn size={12} /> Se connecter
            </motion.button>
          )}
        </div>
      </div>
    </>
  )
}
