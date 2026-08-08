import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getMedia, getProgress, getMyProfile, updateMyProfile, getFriends, getFriendRequests, acceptFriendRequest, deleteFriendship, searchUsers, uploadAvatar, deleteMyAccount, getTrophies } from '../api'
import { useFavorites } from '../context/FavoritesContext'
import { useAuth } from '../context/AuthContext'
import MediaCard from '../components/MediaCard'
import UserProfileSidebar from '../components/UserProfileSidebar'
import { UserCircle, UserPlus, UserCheck, UserX, Search, Check, X } from 'lucide-react'

function StatCard({ label, value, sub, accent = false }) {
  return (
    <div className={`border rounded-2xl px-5 py-4 flex flex-col gap-1 ${accent ? 'bg-accent/8 border-accent/20' : 'bg-white/4 border-white/6'}`}>
      <span className="text-warm/35 text-[10px] uppercase tracking-[0.2em] font-semibold">{label}</span>
      <span className={`font-display text-3xl leading-none ${accent ? 'text-accent' : 'text-warm'}`}>{value}</span>
      {sub && <span className="text-warm/30 text-xs mt-0.5">{sub}</span>}
    </div>
  )
}

function Bar({ label, count, max, color = 'bg-accent' }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-warm/55 text-xs w-28 shrink-0 text-right truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-white/6 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-warm/30 text-xs w-6 text-right">{count}</span>
    </div>
  )
}

export default function Profile() {
  const [allMedia, setAllMedia]     = useState([])
  const [progressList, setProgress] = useState([])
  const [loading, setLoading]       = useState(true)
  const [activeSection, setActive]  = useState(null)
  const scrollLock                  = useRef(false)
  const { ids: favIds }             = useFavorites()
  const { user, name, logout, activeProfile, selectProfile, profiles, refreshSocialProfile } = useAuth()
  const navigate                    = useNavigate()
  const socialId                    = activeProfile?.id ?? user?.id

  // Social state
  const [myProfile, setMyProfile]       = useState(null)
  const [friends, setFriends]           = useState([])
  const [requests, setRequests]         = useState([])
  const [editingProfile, setEditing]    = useState(false)
  const [profileForm, setProfileForm]   = useState({ username: '', display_name: '', bio: '' })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [userSearch, setUserSearch]     = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [trophies, setTrophies] = useState([])

  useEffect(() => {
    Promise.all([getMedia(), getProgress()])
      .then(([media, prog]) => { setAllMedia(media); setProgress(prog) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!socialId) return
    getMyProfile(socialId).then((p) => {
      setMyProfile(p)
      setProfileForm({ username: p.username ?? '', display_name: p.display_name ?? '', bio: p.bio ?? '' })
    })
    getFriends(socialId).then(setFriends)
    getFriendRequests(socialId).then(setRequests)
    getTrophies(socialId).then(setTrophies)
  }, [socialId])

  const handleSearch = useCallback(async (q) => {
    setUserSearch(q)
    if (q.trim().length < 2) { setSearchResults([]); return }
    setSearchLoading(true)
    const res = await searchUsers(q, socialId ?? '')
    setSearchResults(res)
    setSearchLoading(false)
  }, [socialId])

  const handleSaveProfile = async () => {
    if (!socialId) return
    setProfileSaving(true)
    setProfileError('')
    const res = await updateMyProfile({ userId: socialId, ...profileForm })
    if (res.error) { setProfileError(res.error); setProfileSaving(false); return }
    setMyProfile(res)
    setEditing(false)
    setProfileSaving(false)
  }

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !socialId) return
    setAvatarUploading(true)
    const res = await uploadAvatar(socialId, file)
    if (res.avatar_url) {
      setMyProfile((p) => ({ ...p, avatar_url: res.avatar_url }))
      refreshSocialProfile(socialId)
    }
    setAvatarUploading(false)
  }

  const handleDeleteAccount = async () => {
    if (!socialId) return
    await deleteMyAccount(socialId)
    // Retire ce profil du localStorage
    const saved = JSON.parse(localStorage.getItem('prism_profiles') || '[]')
    const updated = saved.filter((p) => p.id !== socialId)
    localStorage.setItem('prism_profiles', JSON.stringify(updated))
    selectProfile(null)
    await logout()
    navigate('/')
  }

  const handleAccept = async (req) => {
    await acceptFriendRequest(req.friendship_id, socialId)
    setRequests((r) => r.filter((x) => x.friendship_id !== req.friendship_id))
    getFriends(socialId).then(setFriends)
  }

  const handleDecline = async (req) => {
    await deleteFriendship(req.friendship_id, socialId)
    setRequests((r) => r.filter((x) => x.friendship_id !== req.friendship_id))
  }

  const handleRemoveFriend = async (f) => {
    await deleteFriendship(f.friendship_id, socialId)
    setFriends((list) => list.filter((x) => x.friendship_id !== f.friendship_id))
  }

  // Suivi de la section visible
  useEffect(() => {
    const ids = ['trophies', 'stats', 'inprogress', 'favorites', 'settings']
    const onScroll = () => {
      if (scrollLock.current) return
      const offset = window.innerHeight * 0.35
      let current = ids[0]
      for (const id of ids) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= offset) current = id
      }
      setActive(current)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [loading])

  const scrollToSection = (id) => {
    setActive(id)
    scrollLock.current = true
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setTimeout(() => { scrollLock.current = false }, 1000)
  }

  const mediaById = useMemo(() => {
    const m = {}
    allMedia.forEach((f) => { m[f.id] = f })
    return m
  }, [allMedia])

  const watched = useMemo(
    () => progressList.filter((p) => p.position_secondes > 60),
    [progressList]
  )

  const totalSeconds = useMemo(
    () => watched.reduce((s, p) => s + (p.position_secondes ?? 0), 0),
    [watched]
  )
  const totalH   = Math.floor(totalSeconds / 3600)
  const totalMin = Math.floor((totalSeconds % 3600) / 60)

  const finished = useMemo(() =>
    watched.filter((p) => {
      const m = mediaById[p.media_id] ?? mediaById[p.id]
      return m?.duree && (p.position_secondes / (m.duree * 60)) > 0.85
    }),
    [watched, mediaById]
  )

  const genreCounts = useMemo(() => {
    const counts = {}
    for (const p of watched) {
      const m = mediaById[p.media_id] ?? mediaById[p.id]
      if (!m) continue
      for (const g of m.genres ?? []) counts[g] = (counts[g] ?? 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [watched, mediaById])

  const maxGenreCount = genreCounts[0]?.[1] ?? 1

  const completionRate = watched.length > 0
    ? Math.round((finished.length / watched.length) * 100)
    : 0

  const avgRating = useMemo(() => {
    const notes = watched.map((p) => {
      const m = mediaById[p.media_id] ?? mediaById[p.id]
      return m?.note
    }).filter(Boolean)
    if (!notes.length) return null
    return (notes.reduce((s, n) => s + n, 0) / notes.length).toFixed(1)
  }, [watched, mediaById])

  const movieCount = useMemo(() =>
    watched.filter((p) => {
      const m = mediaById[p.media_id] ?? mediaById[p.id]
      return m?.media_type === 'movie' || m?.type === 'movie'
    }).length,
  [watched, mediaById])

  const tvCount = watched.length - movieCount

  const decadeCounts = useMemo(() => {
    const counts = {}
    for (const p of watched) {
      const m = mediaById[p.media_id] ?? mediaById[p.id]
      if (!m?.annee_devinee) continue
      const decade = Math.floor(m.annee_devinee / 10) * 10
      counts[decade] = (counts[decade] ?? 0) + 1
    }
    return Object.entries(counts).sort((a, b) => Number(a[0]) - Number(b[0]))
  }, [watched, mediaById])

  const maxDecadeCount = decadeCounts[0] ? Math.max(...decadeCounts.map(([, c]) => c)) : 1

  const recentWatches = useMemo(() =>
    [...progressList]
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 6)
      .map((p) => ({ progress: p, media: mediaById[p.media_id] ?? mediaById[p.id] }))
      .filter(({ media }) => media),
  [progressList, mediaById])

  const favorites = useMemo(
    () => allMedia.filter((m) => favIds.includes(m.id)),
    [allMedia, favIds]
  )

  const inProgress = useMemo(() =>
    progressList.filter((p) => {
      const m = mediaById[p.media_id] ?? mediaById[p.id]
      if (!m?.duree) return false
      const pct = p.position_secondes / (m.duree * 60)
      return pct > 0.02 && pct < 0.85
    }).slice(0, 10),
    [progressList, mediaById]
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <img src="/logo-icon-bold.svg?v=8" alt="Prism" className="w-16 h-16 animate-pulse" />
      </div>
    )
  }

  const unlockedCount = trophies.filter((t) => t.unlocked).length
  const categories = [...new Set(trophies.map((t) => t.category))]

  return (
    <div className="min-h-screen pb-32 pt-12 px-4 md:px-10 lg:px-16 max-w-4xl mx-auto">
<div className="flex gap-8 items-start">

        {/* Sidebar sticky */}
        <div className="sticky top-12 shrink-0 hidden md:block">
          <UserProfileSidebar activeSection={activeSection} onNavigate={scrollToSection} />
        </div>

        {/* Contenu principal */}
        <div className="flex-1 min-w-0 flex flex-col gap-12">

          {/* ── Mon profil public ─────────────────────────────────────── */}
          <section id="social">
            <h2 className="font-display text-xs tracking-[0.2em] text-warm/30 uppercase mb-5">Mon profil</h2>

            <div className="bg-white/4 border border-white/6 rounded-2xl p-5 flex flex-col gap-4">
              {/* Avatar + infos */}
              <div className="flex items-center gap-4">
                <label className="relative cursor-pointer group shrink-0">
                  {myProfile?.avatar_url ? (
                    <img src={myProfile.avatar_url} alt="avatar" className="w-16 h-16 rounded-full object-cover border-2 border-white/10" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-accent/20 border-2 border-accent/30 flex items-center justify-center text-accent font-bold text-xl">
                      {(myProfile?.display_name || myProfile?.username || name || '?').slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    {avatarUploading ? (
                      <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <span className="text-white text-[10px] font-semibold">Photo</span>
                    )}
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} disabled={avatarUploading} />
                </label>
                <div className="flex-1 min-w-0">
                  <p className="text-warm font-semibold text-sm">{myProfile?.display_name || myProfile?.username || 'Sans nom'}</p>
                  {myProfile?.username && <p className="text-warm/35 text-xs">@{myProfile.username}</p>}
                  {myProfile?.bio && <p className="text-warm/50 text-xs mt-1 line-clamp-2">{myProfile.bio}</p>}
                  {!myProfile?.username && <p className="text-accent/60 text-xs">Configure ton profil pour être trouvable</p>}
                </div>
                <button onClick={() => setEditing((v) => !v)}
                  className="text-warm/40 hover:text-warm text-xs px-3 py-1.5 rounded-lg hover:bg-white/6 transition-colors cursor-pointer shrink-0">
                  {editingProfile ? 'Fermer' : 'Modifier'}
                </button>
              </div>

              {/* Formulaire d'édition */}
              {editingProfile && (
                <div className="flex flex-col gap-3 pt-3 border-t border-white/8">
                  {profileError && <p className="text-red-400 text-xs">{profileError}</p>}
                  <div className="flex flex-col gap-1">
                    <label className="text-warm/40 text-[10px] uppercase tracking-widest">Nom d'utilisateur</label>
                    <input value={profileForm.username} onChange={(e) => setProfileForm((f) => ({ ...f, username: e.target.value }))}
                      placeholder="ex: john_doe"
                      className="bg-white/5 border border-white/8 rounded-xl px-3 py-2 text-sm text-warm placeholder-warm/25 focus:outline-none focus:border-accent/40" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-warm/40 text-[10px] uppercase tracking-widest">Nom affiché</label>
                    <input value={profileForm.display_name} onChange={(e) => setProfileForm((f) => ({ ...f, display_name: e.target.value }))}
                      placeholder="ex: John"
                      className="bg-white/5 border border-white/8 rounded-xl px-3 py-2 text-sm text-warm placeholder-warm/25 focus:outline-none focus:border-accent/40" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-warm/40 text-[10px] uppercase tracking-widest">Bio</label>
                    <input value={profileForm.bio} onChange={(e) => setProfileForm((f) => ({ ...f, bio: e.target.value }))}
                      placeholder="Dis quelque chose sur toi…"
                      className="bg-white/5 border border-white/8 rounded-xl px-3 py-2 text-sm text-warm placeholder-warm/25 focus:outline-none focus:border-accent/40" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleSaveProfile} disabled={profileSaving}
                      className="flex-1 py-2 rounded-xl bg-accent text-surface text-sm font-semibold hover:bg-accent/80 transition-colors disabled:opacity-60 cursor-pointer">
                      {profileSaving ? 'Sauvegarde…' : 'Sauvegarder'}
                    </button>
                    <button onClick={() => { setEditing(false); setProfileError('') }}
                      className="px-4 py-2 rounded-xl bg-white/6 text-warm/60 text-sm hover:bg-white/10 transition-colors cursor-pointer">
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ── Trophées ──────────────────────────────────────────────── */}
          <section id="trophies">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display text-xs tracking-[0.2em] text-warm/30 uppercase">Trophées</h2>
              {trophies.length > 0 && (
                <span className="text-warm/30 text-xs">{unlockedCount}/{trophies.length} débloqués</span>
              )}
            </div>

            {trophies.length === 0 ? (
              <p className="text-warm/25 text-sm">Chargement…</p>
            ) : (
              <div className="flex flex-col gap-6">
                {categories.map((cat) => (
                  <div key={cat}>
                    <p className="text-warm/25 text-[10px] uppercase tracking-widest mb-3">{cat}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {trophies.filter((t) => t.category === cat).map((t) => (
                        <div key={t.id}
                          className={`flex items-center gap-3 px-4 py-3 rounded-2xl border transition-all ${
                            t.unlocked
                              ? 'bg-accent/8 border-accent/20'
                              : 'bg-white/3 border-white/6 opacity-50'
                          }`}>
                          <span className={`text-2xl ${!t.unlocked ? 'grayscale' : ''}`}>{t.unlocked ? t.icon : (t.secret ? '🔒' : t.icon)}</span>
                          <div className="min-w-0">
                            <p className={`text-xs font-semibold truncate ${t.unlocked ? 'text-warm' : 'text-warm/40'}`}>
                              {t.secret && !t.unlocked ? '???' : t.name}
                            </p>
                            <p className="text-warm/30 text-[10px] leading-tight line-clamp-2">
                              {t.secret && !t.unlocked ? 'Trophée secret' : t.desc}
                            </p>
                            {t.unlocked && t.unlocked_at && (
                              <p className="text-accent/50 text-[9px] mt-0.5">
                                {new Date(t.unlocked_at * 1000).toLocaleDateString('fr-FR')}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Stats */}
          <section id="stats">
            <h2 className="font-display text-xs tracking-[0.2em] text-warm/30 uppercase mb-5">Statistiques</h2>

            {/* Héros — temps total */}
            <div className="bg-white/3 border border-white/6 rounded-2xl px-6 py-5 mb-3 flex items-end gap-3">
              <span className="font-display text-6xl text-warm leading-none">
                {totalH > 0 ? `${totalH}h` : `${totalMin}min`}
              </span>
              {totalH > 0 && (
                <span className="font-display text-2xl text-warm/30 leading-none mb-1">{totalMin}min</span>
              )}
              <span className="text-warm/30 text-xs mb-1.5 ml-1">de visionnage</span>
            </div>

            {/* Grille de stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
              <StatCard label="Films terminés"     value={finished.length}      sub="à +85%" accent />
              <StatCard label="Taux de complétion" value={`${completionRate}%`} sub="des films commencés" />
              <StatCard label="Note moyenne"        value={avgRating ?? '—'}     sub="des films regardés" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <StatCard label="En cours"   value={inProgress.length} sub="à terminer" />
              <StatCard label="Ma liste"   value={favorites.length}  sub="favoris" />
              <StatCard label="Trophées"   value={`${trophies.filter(t => t.unlocked).length}/${trophies.length}`} sub="débloqués" />
            </div>

            {/* Films vs Séries */}
            {(movieCount > 0 || tvCount > 0) && (
              <div className="mt-8">
                <h3 className="font-display text-xs tracking-[0.2em] text-warm/30 uppercase mb-4">Films vs Séries</h3>
                <div className="flex items-center gap-3">
                  <span className="text-warm/55 text-xs w-28 shrink-0 text-right">Films</span>
                  <div className="flex-1 h-2 bg-white/6 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-accent rounded-l-full transition-all duration-700"
                      style={{ width: `${watched.length > 0 ? (movieCount / watched.length) * 100 : 0}%` }}
                    />
                    <div
                      className="h-full bg-blue-400 rounded-r-full transition-all duration-700"
                      style={{ width: `${watched.length > 0 ? (tvCount / watched.length) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-warm/30 text-xs w-6 text-right">{tvCount}</span>
                </div>
                <div className="flex items-center gap-2 mt-2 pl-[calc(7rem+0.75rem)]">
                  <span className="flex items-center gap-1 text-[10px] text-warm/35"><span className="w-2 h-2 rounded-sm bg-accent inline-block" />Films ({movieCount})</span>
                  <span className="flex items-center gap-1 text-[10px] text-warm/35 ml-3"><span className="w-2 h-2 rounded-sm bg-blue-400 inline-block" />Séries ({tvCount})</span>
                </div>
              </div>
            )}

            {/* Genres préférés */}
            {genreCounts.length > 0 && (
              <div className="mt-8">
                <h3 className="font-display text-xs tracking-[0.2em] text-warm/30 uppercase mb-4">Genres préférés</h3>
                <div className="flex flex-col gap-3">
                  {genreCounts.map(([genre, count]) => (
                    <Bar key={genre} label={genre} count={count} max={maxGenreCount} />
                  ))}
                </div>
              </div>
            )}

            {/* Décennies préférées */}
            {decadeCounts.length > 1 && (
              <div className="mt-8">
                <h3 className="font-display text-xs tracking-[0.2em] text-warm/30 uppercase mb-4">Décennies préférées</h3>
                <div className="flex flex-col gap-3">
                  {decadeCounts.map(([decade, count]) => (
                    <Bar key={decade} label={`Années ${decade}`} count={count} max={maxDecadeCount} color="bg-blue-400" />
                  ))}
                </div>
              </div>
            )}

            {/* Derniers visionnages */}
            {recentWatches.length > 0 && (
              <div className="mt-8">
                <h3 className="font-display text-xs tracking-[0.2em] text-warm/30 uppercase mb-4">Derniers visionnages</h3>
                <div className="grid grid-cols-3 sm:grid-cols-3 gap-2 sm:gap-3">
                  {recentWatches.map(({ progress: p, media: m }) => {
                    const pct = m.duree ? Math.min(100, Math.round((p.position_secondes / (m.duree * 60)) * 100)) : null
                    return (
                      <Link key={m.id} to={`/media/${m.id}`} className="group relative rounded-xl overflow-hidden border border-white/6 hover:border-white/15 transition-colors">
                        {m.poster_path ? (
                          <img
                            src={`https://image.tmdb.org/t/p/w185${m.poster_path}`}
                            alt={m.titre_officiel}
                            className="w-full aspect-[2/3] object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full aspect-[2/3] bg-white/6 flex items-center justify-center">
                            <span className="text-warm/20 text-xs text-center px-2">{m.titre_officiel || m.titre_brut}</span>
                          </div>
                        )}
                        {pct !== null && (
                          <div className="absolute bottom-0 inset-x-0 h-1 bg-black/40">
                            <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                          <p className="text-white text-[10px] font-medium leading-tight line-clamp-2">{m.titre_officiel || m.titre_brut}</p>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}
          </section>

          {/* En cours */}
          <section id="inprogress">
            <h2 className="font-display text-xs tracking-[0.2em] text-warm/30 uppercase mb-5">En cours</h2>
            {inProgress.length > 0 ? (
              <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
                {inProgress.map((p, i) => {
                  const m = mediaById[p.media_id] ?? mediaById[p.id]
                  return m ? <MediaCard key={m.id} media={m} progress={p.position_secondes} index={i} /> : null
                })}
              </div>
            ) : (
              <p className="text-warm/25 text-sm">Aucun film en cours.</p>
            )}
          </section>

          {/* Ma liste */}
          <section id="favorites">
            <h2 className="font-display text-xs tracking-[0.2em] text-warm/30 uppercase mb-5">Ma liste</h2>
            {favorites.length > 0 ? (
              <div className="flex flex-wrap gap-4">
                {favorites.map((m, i) => (
                  <MediaCard key={m.id} media={m} index={i} />
                ))}
              </div>
            ) : (
              <p className="text-warm/25 text-sm">Aucun film dans ta liste.</p>
            )}
          </section>

          {/* ── Demandes d'amis ───────────────────────────────────────── */}
          {requests.length > 0 && (
            <section id="requests">
              <h2 className="font-display text-xs tracking-[0.2em] text-warm/30 uppercase mb-5">
                Demandes d'amis <span className="text-accent">({requests.length})</span>
              </h2>
              <div className="flex flex-col gap-2">
                {requests.map((req) => (
                  <div key={req.friendship_id} className="flex items-center gap-3 bg-white/4 border border-white/6 rounded-2xl px-4 py-3">
                    <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold text-sm shrink-0">
                      {(req.display_name || req.username || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-warm text-sm font-medium truncate">{req.display_name || req.username || 'Utilisateur'}</p>
                      {req.username && <p className="text-warm/35 text-xs">@{req.username}</p>}
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => handleAccept(req)}
                        className="p-2 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors cursor-pointer">
                        <Check size={14} />
                      </button>
                      <button onClick={() => handleDecline(req)}
                        className="p-2 rounded-lg bg-white/6 text-warm/40 hover:bg-red-500/15 hover:text-red-400 transition-colors cursor-pointer">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Amis ──────────────────────────────────────────────────── */}
          <section id="friends">
            <h2 className="font-display text-xs tracking-[0.2em] text-warm/30 uppercase mb-5">
              Amis {friends.length > 0 && <span className="text-warm/50">({friends.length})</span>}
            </h2>

            {/* Recherche */}
            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm/30 pointer-events-none" />
              <input value={userSearch} onChange={(e) => handleSearch(e.target.value)}
                placeholder="Rechercher un utilisateur…"
                className="w-full bg-white/5 border border-white/8 rounded-xl pl-9 pr-4 py-2.5 text-sm text-warm placeholder-warm/25 focus:outline-none focus:border-accent/40 transition-colors" />
            </div>

            {/* Résultats de recherche */}
            {userSearch.trim().length >= 2 && (
              <div className="mb-4 flex flex-col gap-1.5">
                {searchLoading && <p className="text-warm/30 text-xs px-1">Recherche…</p>}
                {!searchLoading && searchResults.length === 0 && (
                  <p className="text-warm/25 text-xs px-1">Aucun utilisateur trouvé</p>
                )}
                {searchResults.map((u) => (
                  <div key={u.id} className="flex items-center gap-3 bg-white/4 border border-white/6 rounded-2xl px-4 py-3">
                    <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold text-sm shrink-0">
                      {(u.display_name || u.username || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/user/${u.id}`)}>
                      <p className="text-warm text-sm font-medium">{u.display_name || u.username}</p>
                      {u.username && <p className="text-warm/35 text-xs">@{u.username}</p>}
                    </div>
                    <button onClick={() => navigate(`/user/${u.id}`)}
                      className="text-accent text-xs px-3 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 transition-colors cursor-pointer">
                      Voir
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Liste d'amis */}
            {friends.length === 0 && userSearch.trim().length < 2 ? (
              <p className="text-warm/25 text-sm">Pas encore d'amis. Recherche des utilisateurs ci-dessus !</p>
            ) : (
              <div className="flex flex-col gap-2">
                {friends.map((f) => (
                  <div key={f.friendship_id} className="flex items-center gap-3 bg-white/4 border border-white/6 rounded-2xl px-4 py-3 group">
                    <div className="w-9 h-9 rounded-full bg-accent/15 flex items-center justify-center text-accent font-bold text-sm shrink-0">
                      {(f.display_name || f.username || '?').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => navigate(`/user/${f.id}`)}>
                      <p className="text-warm text-sm font-medium">{f.display_name || f.username || 'Utilisateur'}</p>
                      {f.username && <p className="text-warm/35 text-xs">@{f.username}</p>}
                    </div>
                    <button onClick={() => handleRemoveFriend(f)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-warm/30 hover:text-red-400 hover:bg-red-500/10 transition-all cursor-pointer">
                      <UserX size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Paramètres */}
          <section id="settings">
            <h2 className="font-display text-xs tracking-[0.2em] text-warm/30 uppercase mb-5">Paramètres</h2>
            <div className="flex flex-col gap-3 max-w-sm">
              <div className="bg-white/4 border border-white/6 rounded-2xl px-6 py-4">
                <p className="text-warm/40 text-xs uppercase tracking-widest mb-1">Compte</p>
                <p className="text-warm text-sm">{user?.email}</p>
              </div>
              <button
                onClick={async () => { await logout(); navigate('/') }}
                className="w-full px-6 py-3 rounded-2xl border border-accent/20 bg-accent/5 text-accent text-sm font-semibold hover:bg-accent/10 transition-colors text-left"
              >
                Se déconnecter
              </button>

              {/* Suppression du profil social */}
              {!confirmDelete ? (
                <button onClick={() => setConfirmDelete(true)}
                  className="w-full px-6 py-3 rounded-2xl border border-red-500/20 bg-red-500/5 text-red-400/70 text-sm font-semibold hover:bg-red-500/10 hover:text-red-400 transition-colors text-left">
                  Supprimer mon profil social
                </button>
              ) : (
                <div className="bg-red-500/8 border border-red-500/20 rounded-2xl px-5 py-4 flex flex-col gap-3">
                  <p className="text-warm/70 text-sm">Ça supprimera ton profil, tes amis et tes données sociales. Irréversible.</p>
                  <div className="flex gap-2">
                    <button onClick={handleDeleteAccount}
                      className="flex-1 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors cursor-pointer">
                      Confirmer la suppression
                    </button>
                    <button onClick={() => setConfirmDelete(false)}
                      className="px-4 py-2 rounded-xl bg-white/6 text-warm/60 text-sm hover:bg-white/10 transition-colors cursor-pointer">
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>

          {watched.length === 0 && favorites.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
              <p className="font-display text-4xl text-warm/8 tracking-widest">AUCUNE ACTIVITÉ</p>
              <p className="text-warm/30 text-sm">Lance un film pour commencer à voir tes stats ici.</p>
              <Link to="/" className="text-accent text-sm hover:underline mt-2">← Retour à l'accueil</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
