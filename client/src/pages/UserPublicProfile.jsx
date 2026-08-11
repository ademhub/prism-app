import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { UserCircle, UserPlus, UserCheck, ArrowLeft, Clock, MessageCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getUserProfile, getFriendStatus, sendFriendRequest, deleteFriendship, getTrophies, getFriends } from '../api'


export default function UserPublicProfile() {
  const { id }                  = useParams()
  const { user, activeProfile } = useAuth()
  const navigate                = useNavigate()
  const socialId                = activeProfile?.id ?? user?.id

  const [profile, setProfile]   = useState(null)
  const [status, setStatus]     = useState({ status: 'none' })
  const [trophies, setTrophies] = useState([])
  const [friendCount, setFriendCount] = useState(0)
  const [loading, setLoading]   = useState(true)
  const [sending, setSending]   = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      getUserProfile(id),
      socialId ? getFriendStatus(socialId, id) : Promise.resolve({ status: 'none' }),
      getTrophies(id),
      getFriends(id),
    ]).then(([p, s, t, f]) => {
      setProfile(p)
      setStatus(s)
      setTrophies((t ?? []).filter((x) => x.unlocked))
      setFriendCount((f ?? []).length)
    }).finally(() => setLoading(false))
  }, [id, socialId])

  const isMine = socialId === id

  async function handleAdd() {
    if (!socialId) return navigate('/login')
    setSending(true)
    const res = await sendFriendRequest(socialId, id)
    if (!res.error) setStatus({ status: 'pending', requester_id: socialId, addressee_id: id })
    setSending(false)
  }

  async function handleRemove() {
    if (!status.id) return
    setSending(true)
    await deleteFriendship(status.id, socialId)
    setStatus({ status: 'none' })
    setSending(false)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
    </div>
  )

  if (!profile) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-warm/40">
      <UserCircle size={48} />
      <p>Profil introuvable</p>
      <button onClick={() => navigate(-1)} className="text-accent text-sm hover:underline cursor-pointer">← Retour</button>
    </div>
  )

  const displayName = profile.display_name || profile.username || 'Utilisateur'
  const initials    = displayName.slice(0, 2).toUpperCase()

  const friendBtn = () => {
    if (status.status === 'accepted')
      return { icon: <UserCheck size={14} />, label: 'Amis', action: handleRemove, cls: 'bg-green-500/15 text-green-400 hover:bg-red-500/15 hover:text-red-400' }
    if (status.status === 'pending' && status.requester_id === socialId)
      return { icon: <Clock size={14} />, label: 'Demande envoyée', action: null, cls: 'bg-white/8 text-warm/40 cursor-default' }
    if (status.status === 'pending')
      return { icon: <UserPlus size={14} />, label: 'Accepter', action: handleAdd, cls: 'bg-accent text-surface hover:bg-accent/80' }
    return { icon: <UserPlus size={14} />, label: 'Ajouter en ami', action: handleAdd, cls: 'bg-accent text-surface hover:bg-accent/80' }
  }

  const btn = !isMine ? friendBtn() : null

  const categoryOrder = ['Visionnage', 'Exploration', 'Social']
  const grouped = categoryOrder.reduce((acc, cat) => {
    const items = trophies.filter((t) => t.category === cat)
    if (items.length) acc.push({ cat, items })
    return acc
  }, [])

  return (
    <div className="min-h-screen pb-32 pt-12 px-6 max-w-2xl mx-auto">
      <button onClick={() => navigate(-1)}
        className="flex items-center gap-2 text-warm/40 hover:text-warm transition-colors mb-8 text-sm cursor-pointer">
        <ArrowLeft size={16} /> Retour
      </button>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-5 text-center mb-10">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt={displayName}
            className="w-24 h-24 rounded-full object-cover border-2 border-white/10" />
        ) : (
          <div className="w-24 h-24 rounded-full bg-accent/20 border-2 border-accent/30 flex items-center justify-center text-accent font-bold text-2xl">
            {initials}
          </div>
        )}

        <div>
          <h1 className="font-display text-3xl text-warm">{displayName}</h1>
          {profile.username && <p className="text-warm/35 text-sm mt-0.5">@{profile.username}</p>}
          {profile.bio && <p className="text-warm/55 text-sm mt-3 max-w-xs mx-auto leading-relaxed">{profile.bio}</p>}
        </div>

        {/* Stat mini */}
        <div className="flex items-center gap-6 text-center">
          <div>
            <p className="text-warm font-bold text-lg">{trophies.length}</p>
            <p className="text-warm/35 text-xs">Trophées</p>
          </div>
          <div className="w-px h-8 bg-white/8" />
          <div>
            <p className="text-warm font-bold text-lg">{friendCount}</p>
            <p className="text-warm/35 text-xs">Amis</p>
          </div>
        </div>

        {/* Boutons */}
        {!isMine && (
          <div className="flex items-center gap-3">
            {btn && (
              <button
                onClick={btn.action ?? (() => {})}
                disabled={sending || !btn.action}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all cursor-pointer disabled:opacity-60 ${btn.cls}`}
              >
                {btn.icon} {btn.label}
              </button>
            )}
            {status.status === 'accepted' && (
              <Link to={`/messages?with=${id}`}
                className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-white/8 text-warm/70 hover:bg-white/12 hover:text-warm transition-colors">
                <MessageCircle size={14} /> Message
              </Link>
            )}
          </div>
        )}
        {isMine && (
          <Link to="/profile"
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold bg-white/8 text-warm/60 hover:text-warm hover:bg-white/12 transition-colors">
            Modifier mon profil
          </Link>
        )}
      </div>

      {/* ── Trophées ─────────────────────────────────────────────────── */}
      {grouped.length > 0 ? (
        <div className="space-y-6">
          <h2 className="font-display text-xs tracking-[0.2em] text-warm/30 uppercase">Trophées débloqués</h2>
          {grouped.map(({ cat, items }) => (
            <div key={cat}>
              <p className="text-warm/25 text-[10px] uppercase tracking-widest mb-3">{cat}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {items.map((t) => (
                  <div key={t.id}
                    className="flex items-center gap-3 p-3 rounded-2xl bg-white/4 border border-white/6 hover:bg-white/6 transition-colors">
                    <span className="text-2xl shrink-0">{t.icon}</span>
                    <div className="min-w-0">
                      <p className="text-warm text-xs font-semibold leading-snug">{t.name}</p>
                      <p className="text-warm/35 text-[10px] leading-snug mt-0.5 line-clamp-2">{t.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-10 h-10 text-warm/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>
          <p className="text-warm/25 text-sm">Aucun trophée débloqué pour l'instant</p>
        </div>
      )}
    </div>
  )
}
