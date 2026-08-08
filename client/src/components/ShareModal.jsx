import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Search, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getFriends, sendMessage } from '../api'

export default function ShareModal({ shareData, onClose }) {
  const { user, activeProfile } = useAuth()
  const socialId = activeProfile?.id ?? user?.id

  const [friends, setFriends] = useState([])
  const [search, setSearch]   = useState('')
  const [sent, setSent]       = useState({})
  const [sending, setSending] = useState(null)

  useEffect(() => {
    if (!socialId) return
    getFriends(socialId).then(setFriends)
  }, [socialId])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = friends.filter((f) => {
    const name = (f.display_name || f.username || '').toLowerCase()
    return name.includes(search.toLowerCase())
  })

  const handleSend = async (friend) => {
    if (sending === friend.id || sent[friend.id]) return
    setSending(friend.id)
    const content = JSON.stringify(shareData)
    await sendMessage(socialId, friend.id, content).catch(() => {})
    setSent((s) => ({ ...s, [friend.id]: true }))
    setSending(null)
  }

  const preview = shareData.kind === 'media'
    ? shareData.title
    : shareData.name

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className="relative z-10 w-full max-w-sm mx-4 bg-surface/98 backdrop-blur-xl border border-white/10 rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.7)] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
          <div>
            <p className="text-warm font-semibold text-sm">Partager</p>
            <p className="text-warm/35 text-xs truncate max-w-[200px]">{preview}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-warm/30 hover:text-warm hover:bg-white/8 transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pt-3 pb-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm/25 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un ami…"
              autoFocus
              className="w-full bg-white/5 border border-white/8 rounded-xl pl-8 pr-3 py-2 text-xs text-warm placeholder-warm/25 focus:outline-none focus:border-accent/30 transition-colors"
            />
          </div>
        </div>

        {/* Friends list */}
        <div className="max-h-64 overflow-y-auto px-2 pb-3">
          {filtered.length === 0 ? (
            <p className="text-warm/25 text-xs text-center py-8">
              {friends.length === 0 ? 'Aucun ami pour l\'instant' : 'Aucun résultat'}
            </p>
          ) : (
            filtered.map((f) => {
              const name = f.display_name || f.username || 'Utilisateur'
              const initial = name[0].toUpperCase()
              const isSent = sent[f.id]
              const isSending = sending === f.id
              return (
                <button
                  key={f.id}
                  onClick={() => handleSend(f)}
                  disabled={isSent || isSending}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/6 transition-colors cursor-pointer disabled:cursor-default group"
                >
                  {f.avatar_url ? (
                    <img src={f.avatar_url} alt={name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center text-accent font-bold text-sm shrink-0">
                      {initial}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-warm text-sm font-medium truncate">{name}</p>
                    {f.username && <p className="text-warm/30 text-xs">@{f.username}</p>}
                  </div>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${
                    isSent ? 'bg-green-500/20 text-green-400' : 'bg-accent/15 text-accent group-hover:bg-accent group-hover:text-white'
                  }`}>
                    {isSent ? <Check size={13} /> : isSending
                      ? <div className="w-3 h-3 border border-accent border-t-transparent rounded-full animate-spin" />
                      : <Send size={13} />
                    }
                  </div>
                </button>
              )
            })
          )}
        </div>
      </motion.div>
    </div>
  )
}
