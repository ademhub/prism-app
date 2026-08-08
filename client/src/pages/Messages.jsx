import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { Send, Search, ArrowLeft, MessageCircle, Radio, Play, Pencil, Trash2, UserMinus, Check, X, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import Hls from 'hls.js'
import { useAuth } from '../context/AuthContext'
import { getFriends, getConversation, sendMessage, getConversations, deleteMessage, editMessage, deleteFriendship } from '../api'

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ profile, size = 'md' }) {
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-12 h-12 text-base' : 'w-10 h-10 text-sm'
  const label = (profile?.display_name || profile?.username || '?').slice(0, 2).toUpperCase()
  if (profile?.avatar_url) {
    return <img src={profile.avatar_url} alt={label} className={`${sz} rounded-full object-cover shrink-0`} />
  }
  return (
    <div className={`${sz} rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent font-bold shrink-0`}>
      {label}
    </div>
  )
}

// ── Context menu ──────────────────────────────────────────────────────────────

function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    const handleClick = () => onClose()
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])
  const menuW = 160
  const menuH = items.length * 40
  const adjX = x + menuW > window.innerWidth ? x - menuW : x
  const adjY = y + menuH > window.innerHeight ? y - menuH : y
  return (
    <div
      ref={ref}
      onMouseDown={(e) => e.stopPropagation()}
      style={{ position: 'fixed', top: adjY, left: adjX, zIndex: 9999, minWidth: menuW }}
      className="bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl py-1 overflow-hidden"
    >
      {items.map((item) => (
        <button key={item.label} onClick={() => { item.action(); onClose() }}
          className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs font-medium transition-colors hover:bg-white/8 cursor-pointer ${item.danger ? 'text-red-400 hover:text-red-300' : 'text-warm/80 hover:text-warm'}`}>
          {item.icon}{item.label}
        </button>
      ))}
    </div>
  )
}

// ── Bottom sheet menu (mobile) ────────────────────────────────────────────────

function BottomSheet({ items, onClose }) {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col justify-end" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div onMouseDown={(e) => e.stopPropagation()}
        className="relative bg-[#1c1c1e] rounded-t-3xl pb-8 pt-2 overflow-hidden">
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
        {items.map((item, i) => (
          <button key={item.label} onClick={() => { item.action(); onClose() }}
            className={`w-full flex items-center gap-4 px-6 py-4 text-[15px] font-medium transition-colors active:bg-white/5 ${
              item.danger ? 'text-red-400' : 'text-warm/90'
            } ${i > 0 ? 'border-t border-white/6' : ''}`}>
            <span className={`w-8 h-8 rounded-full flex items-center justify-center ${item.danger ? 'bg-red-500/15' : 'bg-white/8'}`}>
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Share Card ────────────────────────────────────────────────────────────────

function ShareCard({ share, isOwn, onPlayChannel }) {
  if (share.kind === 'media') {
    return (
      <Link to={`/media/${share.id}`} className={`w-52 rounded-2xl overflow-hidden border block ${isOwn ? 'border-accent/30 bg-accent/10' : 'border-white/10 bg-white/5'}`}>
        {share.poster ? (
          <img src={`https://image.tmdb.org/t/p/w342${share.poster}`} alt={share.title} className="w-full aspect-[16/9] object-cover object-top" />
        ) : (
          <div className="w-full aspect-[16/9] bg-white/8 flex items-center justify-center">
            <Play size={24} className="text-warm/20" />
          </div>
        )}
        <div className="px-3 py-2.5">
          <p className="text-warm text-xs font-semibold leading-snug line-clamp-2">{share.title}</p>
          {share.year && <p className="text-warm/35 text-[10px] mt-0.5">{share.year}</p>}
          <span className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-accent">
            <Play size={10} /> Regarder
          </span>
        </div>
      </Link>
    )
  }
  if (share.kind === 'channel') {
    return (
      <button
        onClick={() => share.url && onPlayChannel?.(share)}
        className={`w-48 rounded-2xl overflow-hidden border px-4 py-3 flex items-center gap-3 cursor-pointer transition-opacity hover:opacity-80 ${isOwn ? 'border-accent/30 bg-accent/10' : 'border-white/10 bg-white/5'}`}>
        {share.logo ? (
          <img src={share.logo} alt={share.name} className="w-10 h-10 object-contain rounded-lg shrink-0" onError={(e) => { e.currentTarget.style.display = 'none' }} />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-white/8 flex items-center justify-center shrink-0">
            <Radio size={16} className="text-warm/30" />
          </div>
        )}
        <div className="min-w-0 text-left">
          <p className="text-warm text-xs font-semibold truncate">{share.name}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 text-[10px] font-semibold">Live</span>
          </div>
          {share.url && <p className="text-accent text-[10px] mt-1">▶ Regarder</p>}
        </div>
      </button>
    )
  }
  return null
}

// ── Live Channel Player (pour les shares de chaînes) ─────────────────────────

function LiveChannelModal({ channel, onClose }) {
  const [streamUrl, setStreamUrl] = useState(null)
  const [err, setErr]             = useState(null)
  const videoRef = useRef(null)
  const hlsRef   = useRef(null)

  useEffect(() => {
    fetch(`/api/live-resolve?url=${encodeURIComponent(channel.url)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.stream) setStreamUrl(`/api/hls-proxy?url=${encodeURIComponent(d.stream)}`)
        else setErr(d.error ?? 'Flux indisponible')
      })
      .catch(() => setErr('Flux indisponible'))
  }, [channel.url])

  useEffect(() => {
    if (!streamUrl || !videoRef.current) return
    const video = videoRef.current
    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: false })
      hlsRef.current = hls
      hls.loadSource(streamUrl)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}))
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl
      video.play().catch(() => {})
    }
    return () => { hlsRef.current?.destroy(); hlsRef.current = null }
  }, [streamUrl])

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-2xl mx-4 rounded-2xl overflow-hidden border border-white/8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/95">
          <div className="flex items-center gap-3">
            {channel.logo && <img src={channel.logo} alt="" className="h-6 object-contain rounded" onError={(e) => { e.currentTarget.style.display = 'none' }} />}
            <div>
              <p className="text-warm font-semibold text-sm">{channel.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-red-400 text-[10px] font-semibold tracking-widest uppercase">Live</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-warm/40 hover:text-warm hover:bg-white/8 transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <div className="aspect-video bg-black flex items-center justify-center">
          {err ? (
            <p className="text-warm/40 text-sm">{err}</p>
          ) : !streamUrl ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-7 h-7 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
              <p className="text-warm/30 text-xs">Résolution du flux…</p>
            </div>
          ) : (
            <video ref={videoRef} controls playsInline autoPlay className="w-full h-full" />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Page principale ───────────────────────────────────────────────────────────

export default function Messages() {
  const { user, activeProfile } = useAuth()
  const socialId = activeProfile?.id ?? user?.id
  const [searchParams, setSearchParams] = useSearchParams()

  const [friends, setFriends]             = useState([])
  const [conversations, setConversations] = useState([])
  const [activeFriendId, setActiveFriendId] = useState(searchParams.get('with') ?? null)
  const [messages, setMessages]           = useState([])
  const [input, setInput]                 = useState('')
  const [sending, setSending]             = useState(false)
  const [search, setSearch]               = useState('')
  const [loading, setLoading]             = useState(false)
  const [ctxMenu, setCtxMenu]             = useState(null)
  const [bottomSheet, setBottomSheet]     = useState(null)
  const [editingId, setEditingId]         = useState(null)
  const [editText, setEditText]           = useState('')
  const navigate = useNavigate()
  const bottomRef      = useRef(null)
  const mobileRef      = useRef(null)
  const desktopRef     = useRef(null)
  const inputRef       = useRef(null)
  const pollRef        = useRef(null)
  const editRef        = useRef(null)
  const initialLoad    = useRef(false)

  useEffect(() => {
    if (!socialId) return
    getFriends(socialId).then(setFriends)
    getConversations(socialId).then(setConversations)
  }, [socialId])

  useEffect(() => {
    if (!socialId || !activeFriendId) return
    setLoading(true)
    setMessages([])
    initialLoad.current = true
    window.dispatchEvent(new Event('messages-read'))
    getConversation(socialId, activeFriendId).then(setMessages).finally(() => setLoading(false))
    setSearchParams({ with: activeFriendId }, { replace: true })
    setTimeout(() => inputRef.current?.focus(), 100)
    clearInterval(pollRef.current)
    pollRef.current = setInterval(() => {
      getConversation(socialId, activeFriendId).then(setMessages)
      getConversations(socialId).then(setConversations)
    }, 3000)
    return () => clearInterval(pollRef.current)
  }, [activeFriendId, socialId])

  useEffect(() => {
    if (!messages.length) return
    requestAnimationFrame(() => {
      ;[mobileRef.current, desktopRef.current].forEach((el) => {
        if (!el) return
        if (initialLoad.current) {
          el.scrollTop = el.scrollHeight
        } else {
          const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200
          if (nearBottom) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
        }
      })
      initialLoad.current = false
    })
  }, [messages])

  const activeFriend = friends.find((f) => f.id === activeFriendId)

  const handleSend = useCallback(async () => {
    if (!input.trim() || !activeFriendId || !socialId || sending) return
    setSending(true)
    const msg = await sendMessage(socialId, activeFriendId, input.trim())
    setInput('')
    setMessages((prev) => [...prev, msg])
    getConversations(socialId).then(setConversations)
    setSending(false)
  }, [input, activeFriendId, socialId, sending])

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const openMsgCtx = (e, msg, isMobile = false) => {
    e.preventDefault()
    const isOwn = msg.sender_id === socialId
    const items = []
    if (isOwn) {
      items.push({ label: 'Modifier', icon: <Pencil size={14} />, action: () => { setEditingId(msg.id); setEditText(msg.content); setTimeout(() => editRef.current?.focus(), 50) } })
    }
    items.push({ label: 'Supprimer', icon: <Trash2 size={14} />, danger: true, action: () => handleDeleteMsg(msg.id) })
    if (isMobile) { setBottomSheet(items) } else { setCtxMenu({ x: e.clientX, y: e.clientY, items }) }
  }

  const handleDeleteMsg = async (msgId) => {
    setMessages((prev) => prev.filter((m) => m.id !== msgId))
    await deleteMessage(msgId, socialId)
    getConversations(socialId).then(setConversations)
  }

  const handleEditSave = async (msgId) => {
    if (!editText.trim()) return
    const updated = await editMessage(msgId, socialId, editText.trim())
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, content: updated.content ?? editText.trim() } : m))
    setEditingId(null)
  }

  const openFriendCtx = (e, friend, isMobile = false) => {
    e.preventDefault()
    const items = [{ label: 'Supprimer', icon: <UserMinus size={14} />, danger: true, action: () => handleRemoveFriend(friend) }]
    if (isMobile) { setBottomSheet(items) } else { setCtxMenu({ x: e.clientX, y: e.clientY, items }) }
  }

  const handleRemoveFriend = async (friend) => {
    if (!friend.friendship_id) return
    await deleteFriendship(friend.friendship_id, socialId)
    setFriends((prev) => prev.filter((f) => f.id !== friend.id))
    setConversations((prev) => prev.filter((c) => c.sender_id !== friend.id && c.recipient_id !== friend.id))
    if (activeFriendId === friend.id) setActiveFriendId(null)
  }

  const filteredFriends = friends.filter((f) =>
    (f.display_name || f.username || '').toLowerCase().includes(search.toLowerCase())
  )

  const friendsWithConv = filteredFriends.map((f) => {
    const conv = conversations.find((c) => c.sender_id === f.id || c.recipient_id === f.id)
    return { ...f, lastMsg: conv?.content, lastAt: conv?.created_at, unread: conv?.unread ?? 0 }
  }).sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))

  function fmtTime(ts) {
    if (!ts) return ''
    const d = new Date(ts * 1000)
    const diff = Date.now() - d
    if (diff < 60000) return 'maintenant'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}min`
    if (diff < 86400000) return format(d, 'HH:mm')
    return format(d, 'dd/MM')
  }

  function fmtMsgTime(ts) {
    if (!ts) return ''
    return format(new Date(ts * 1000), 'HH:mm')
  }

  function lastMsgPreview(raw) {
    try { const p = JSON.parse(raw); if (p?.type === 'share') return `[Film] ${p.title || p.name}` } catch {}
    return raw
  }

  if (!socialId) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-warm/40">Connecte-toi pour accéder aux messages</p>
    </div>
  )

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <>
      {ctxMenu && <ContextMenu x={ctxMenu.x} y={ctxMenu.y} items={ctxMenu.items} onClose={() => setCtxMenu(null)} />}
      {bottomSheet && <BottomSheet items={bottomSheet} onClose={() => setBottomSheet(null)} />}

      {/* ════════════════════════════════════════════════════════════
          MOBILE  (< md)
      ════════════════════════════════════════════════════════════ */}
      <div className="md:hidden fixed inset-0 z-10 bg-surface flex flex-col">

        {/* ── Vue liste ── */}
        {!activeFriendId && (
          <>
            {/* Header liste */}
            <div className="shrink-0 px-5 pt-14 pb-3 bg-surface">
              <h1 className="font-display text-2xl text-warm tracking-wide mb-4">Messages</h1>
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-warm/30 pointer-events-none" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher une conversation…"
                  className="w-full bg-white/6 rounded-2xl pl-10 pr-4 py-2.5 text-sm text-warm placeholder-warm/25 focus:outline-none border border-white/8 focus:border-accent/30 transition-colors" />
              </div>
            </div>

            {/* Liste conversations */}
            <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden">
              {friendsWithConv.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 px-8 text-center pb-24">
                  <MessageCircle size={40} className="text-warm/10" />
                  <p className="text-warm/30 text-sm">Aucune conversation</p>
                  <p className="text-warm/20 text-xs">Ajoute des amis depuis ton profil pour leur écrire</p>
                </div>
              ) : (
                <div className="pb-28">
                  {friendsWithConv.map((f) => (
                    <button key={f.id}
                      onClick={() => setActiveFriendId(f.id)}
                      onContextMenu={(e) => openFriendCtx(e, f, true)}
                      onTouchStart={() => {
                        const t = setTimeout(() => openFriendCtx({ preventDefault: () => {} }, f, true), 500)
                        const cancel = () => clearTimeout(t)
                        window.addEventListener('touchend', cancel, { once: true })
                        window.addEventListener('touchmove', cancel, { once: true })
                      }}
                      className="w-full flex items-center gap-3.5 px-5 py-3.5 active:bg-white/5 transition-colors border-b border-white/4 text-left"
                    >
                      <div className="relative shrink-0">
                        <Avatar profile={f} size="lg" />
                        {f.unread > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-accent text-white text-[9px] font-bold flex items-center justify-center shadow">
                            {f.unread > 9 ? '9+' : f.unread}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className={`text-[15px] font-semibold truncate ${f.unread > 0 ? 'text-warm' : 'text-warm/85'}`}>
                            {f.display_name || f.username || 'Utilisateur'}
                          </span>
                          {f.lastAt && (
                            <span className={`text-[11px] shrink-0 ${f.unread > 0 ? 'text-accent font-medium' : 'text-warm/30'}`}>
                              {fmtTime(f.lastAt)}
                            </span>
                          )}
                        </div>
                        {f.lastMsg ? (
                          <p className={`text-[13px] truncate mt-0.5 ${f.unread > 0 ? 'text-warm/70 font-medium' : 'text-warm/35'}`}>
                            {lastMsgPreview(f.lastMsg)}
                          </p>
                        ) : (
                          <p className="text-[13px] text-warm/20 mt-0.5">Démarrer la conversation</p>
                        )}
                      </div>
                      <ChevronRight size={15} className="text-warm/15 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Vue chat ── */}
        {activeFriendId && (
          <div className="flex flex-col h-full">
            {/* Header chat */}
            <div className="shrink-0 flex items-center gap-3 px-4 pt-14 pb-3 bg-surface border-b border-white/6">
              <button onClick={() => setActiveFriendId(null)}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/8 text-warm/70 transition-colors shrink-0">
                <ArrowLeft size={20} />
              </button>
              <Link to={activeFriend ? `/user/${activeFriend.id}` : '#'} className="flex items-center gap-3 flex-1 min-w-0">
                {activeFriend && <Avatar profile={activeFriend} size="sm" />}
                <div className="min-w-0">
                  <p className="text-warm font-semibold text-[15px] truncate leading-tight">
                    {activeFriend?.display_name || activeFriend?.username || 'Utilisateur'}
                  </p>
                  {activeFriend?.username && (
                    <p className="text-warm/35 text-xs truncate">@{activeFriend.username}</p>
                  )}
                </div>
              </Link>
            </div>

            {/* Messages */}
            <div ref={mobileRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2 [&::-webkit-scrollbar]:hidden pb-4">
              {loading && (
                <div className="flex justify-center py-8">
                  <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                </div>
              )}
              {!loading && messages.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center py-16">
                  <Avatar profile={activeFriend} size="lg" />
                  <p className="text-warm/70 font-semibold text-sm mt-2">{activeFriend?.display_name || activeFriend?.username}</p>
                  <p className="text-warm/25 text-xs">Envoie le premier message !</p>
                </div>
              )}
              {messages.map((msg, i) => {
                const isOwn = msg.sender_id === socialId
                const showTime = i === 0 || (msg.created_at - messages[i - 1].created_at) > 300
                let share = null
                try { const p = JSON.parse(msg.content); if (p?.type === 'share') share = p } catch {}
                const isEditing = editingId === msg.id
                const isFirst = i === 0 || messages[i - 1].sender_id !== msg.sender_id
                const isLast = i === messages.length - 1 || messages[i + 1].sender_id !== msg.sender_id

                return (
                  <div key={msg.id}>
                    {showTime && (
                      <div className="flex justify-center my-3">
                        <span className="text-warm/25 text-[11px] bg-white/4 rounded-full px-3 py-0.5">{fmtMsgTime(msg.created_at)}</span>
                      </div>
                    )}
                    <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                      {/* Avatar ami — seulement sur le dernier message d'une série */}
                      <div className="w-7 shrink-0">
                        {!isOwn && isLast && <Avatar profile={activeFriend} size="sm" />}
                      </div>
                      {share ? (
                        <div onTouchStart={() => {
                          const t = setTimeout(() => openMsgCtx({ preventDefault: () => {} }, msg, true), 500)
                          const cancel = () => clearTimeout(t)
                          window.addEventListener('touchend', cancel, { once: true })
                          window.addEventListener('touchmove', cancel, { once: true })
                        }}>
                          <ShareCard share={share} isOwn={isOwn} onPlayChannel={(ch) => {
                              fetch(`/api/live-resolve?url=${encodeURIComponent(ch.url)}`).catch(() => {})
                              navigate('/channels', { state: { channel: ch } })
                            }} />
                        </div>
                      ) : isEditing ? (
                        <div className="flex-1 flex items-center gap-2 max-w-[80%]">
                          <input ref={editRef} value={editText} onChange={(e) => setEditText(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleEditSave(msg.id); if (e.key === 'Escape') setEditingId(null) }}
                            className="flex-1 bg-accent/20 border border-accent/40 rounded-2xl px-4 py-2.5 text-sm text-warm focus:outline-none" />
                          <button onClick={() => handleEditSave(msg.id)} className="w-8 h-8 rounded-full bg-accent flex items-center justify-center shrink-0">
                            <Check size={14} className="text-white" />
                          </button>
                          <button onClick={() => setEditingId(null)} className="w-8 h-8 rounded-full bg-white/8 flex items-center justify-center shrink-0">
                            <X size={14} className="text-warm/50" />
                          </button>
                        </div>
                      ) : (
                        <div
                          onContextMenu={(e) => openMsgCtx(e, msg, false)}
                          onTouchStart={() => {
                            const t = setTimeout(() => openMsgCtx({ preventDefault: () => {} }, msg, true), 500)
                            const cancel = () => clearTimeout(t)
                            window.addEventListener('touchend', cancel, { once: true })
                            window.addEventListener('touchmove', cancel, { once: true })
                          }}
                          className={`max-w-[78%] px-4 py-2.5 text-[15px] leading-relaxed select-none ${
                            isOwn
                              ? `bg-accent text-white ${isFirst ? 'rounded-t-2xl' : 'rounded-2xl'} rounded-bl-2xl ${isLast ? 'rounded-br-sm' : 'rounded-br-2xl'}`
                              : `bg-[#2c2c2e] text-warm ${isFirst ? 'rounded-t-2xl' : 'rounded-2xl'} rounded-br-2xl ${isLast ? 'rounded-bl-sm' : 'rounded-bl-2xl'}`
                          }`}
                        >
                          {msg.content}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 px-3 py-3 pb-24 border-t border-white/6 bg-surface">
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center bg-[#2c2c2e] rounded-3xl px-4 py-2.5 border border-white/6 focus-within:border-accent/30 transition-colors">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Message…"
                    className="flex-1 bg-transparent text-[15px] text-warm placeholder-warm/25 focus:outline-none"
                  />
                </div>
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  className="w-10 h-10 rounded-full bg-accent text-white disabled:opacity-30 transition-all flex items-center justify-center shrink-0 active:scale-95"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════
          DESKTOP  (md+)
      ════════════════════════════════════════════════════════════ */}
      <div className="hidden md:block min-h-screen pb-24 pt-12 px-4 max-w-5xl mx-auto">
        <div className="flex gap-4 h-[calc(100vh-9rem)]">

          {/* Sidebar amis */}
          <div className="flex flex-col w-72 shrink-0 rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
            <div className="px-4 py-4 border-b border-white/8 shrink-0">
              <h2 className="font-display text-xs tracking-[0.2em] text-warm/30 uppercase mb-3">Messages</h2>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-warm/25 pointer-events-none" />
                <input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher…"
                  className="w-full bg-white/5 border border-white/8 rounded-xl pl-8 pr-3 py-2 text-xs text-warm placeholder-warm/25 focus:outline-none focus:border-accent/30 transition-colors" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {friendsWithConv.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
                  <MessageCircle size={32} className="text-warm/15" />
                  <p className="text-warm/25 text-xs">Ajoute des amis pour leur envoyer des messages</p>
                </div>
              ) : (
                friendsWithConv.map((f) => (
                  <button key={f.id}
                    onClick={() => setActiveFriendId(f.id)}
                    onContextMenu={(e) => openFriendCtx(e, f)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/5 cursor-pointer ${
                      activeFriendId === f.id ? 'bg-white/8 border-r-2 border-accent' : ''
                    }`}>
                    <div className="relative">
                      <Avatar profile={f} size="md" />
                      {f.unread > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-accent text-white text-[9px] font-bold flex items-center justify-center">
                          {f.unread}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-sm font-medium truncate ${activeFriendId === f.id ? 'text-warm' : 'text-warm/75'}`}>
                          {f.display_name || f.username || 'Utilisateur'}
                        </span>
                        {f.lastAt && <span className="text-warm/25 text-[10px] shrink-0">{fmtTime(f.lastAt)}</span>}
                      </div>
                      {f.lastMsg && (
                        <p className={`text-xs truncate mt-0.5 ${f.unread > 0 ? 'text-warm/70 font-medium' : 'text-warm/30'}`}>
                          {lastMsgPreview(f.lastMsg)}
                        </p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Zone de chat */}
          <div className="flex-1 flex flex-col rounded-2xl border border-white/8 bg-white/3 overflow-hidden">
            {!activeFriendId ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
                <MessageCircle size={48} className="text-warm/10" />
                <p className="font-display text-2xl text-warm/15 tracking-wide">Sélectionne une conversation</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 px-5 py-4 border-b border-white/8 shrink-0">
                  {activeFriend && (
                    <Link to={`/user/${activeFriend.id}`}>
                      <Avatar profile={activeFriend} size="sm" />
                    </Link>
                  )}
                  <Link to={activeFriend ? `/user/${activeFriend.id}` : '#'} className="hover:opacity-80 transition-opacity">
                    <p className="text-warm font-semibold text-sm">
                      {activeFriend?.display_name || activeFriend?.username || 'Utilisateur'}
                    </p>
                    {activeFriend?.username && <p className="text-warm/30 text-xs">@{activeFriend.username}</p>}
                  </Link>
                </div>

                <div ref={desktopRef} className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {loading && (
                    <div className="flex justify-center py-8">
                      <div className="w-5 h-5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                    </div>
                  )}
                  {!loading && messages.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center py-16">
                      <p className="text-warm/20 text-sm">Commencez la conversation !</p>
                    </div>
                  )}
                  {messages.map((msg, i) => {
                    const isOwn = msg.sender_id === socialId
                    const showTime = i === 0 || (msg.created_at - messages[i - 1].created_at) > 300
                    let share = null
                    try { const p = JSON.parse(msg.content); if (p?.type === 'share') share = p } catch {}
                    const isEditing = editingId === msg.id
                    return (
                      <div key={msg.id}>
                        {showTime && (
                          <div className="flex justify-center my-2">
                            <span className="text-warm/20 text-[10px] px-2">{fmtMsgTime(msg.created_at)}</span>
                          </div>
                        )}
                        <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                          {!isOwn && <Avatar profile={activeFriend} size="sm" />}
                          {share ? (
                            <div onContextMenu={(e) => openMsgCtx(e, msg)}>
                              <ShareCard share={share} isOwn={isOwn} onPlayChannel={(ch) => {
                              fetch(`/api/live-resolve?url=${encodeURIComponent(ch.url)}`).catch(() => {})
                              navigate('/channels', { state: { channel: ch } })
                            }} />
                            </div>
                          ) : isEditing ? (
                            <div className="max-w-[70%] flex items-center gap-1.5">
                              <input ref={editRef} value={editText} onChange={(e) => setEditText(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleEditSave(msg.id); if (e.key === 'Escape') setEditingId(null) }}
                                className="flex-1 bg-accent/20 border border-accent/40 rounded-xl px-3 py-2 text-sm text-warm focus:outline-none focus:border-accent/70" />
                              <button onClick={() => handleEditSave(msg.id)} className="p-1.5 rounded-lg bg-accent/20 hover:bg-accent/40 text-accent transition-colors cursor-pointer">
                                <Check size={13} />
                              </button>
                              <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg hover:bg-white/8 text-warm/40 hover:text-warm transition-colors cursor-pointer">
                                <X size={13} />
                              </button>
                            </div>
                          ) : (
                            <div
                              onContextMenu={(e) => openMsgCtx(e, msg)}
                              className={`max-w-[70%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed select-none ${
                                isOwn
                                  ? 'bg-accent text-white rounded-br-sm'
                                  : 'bg-white/8 text-warm border border-white/6 rounded-bl-sm'
                              }`}
                            >
                              {msg.content}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  <div ref={bottomRef} />
                </div>

                <div className="px-4 py-3 border-t border-white/8 shrink-0">
                  <div className="flex items-center gap-2 bg-white/5 border border-white/8 rounded-2xl px-4 py-2 focus-within:border-accent/30 transition-colors">
                    <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKey} placeholder="Écris un message…"
                      className="flex-1 bg-transparent text-sm text-warm placeholder-warm/25 focus:outline-none" />
                    <button onClick={handleSend} disabled={!input.trim() || sending}
                      className="p-1.5 rounded-xl bg-accent text-white disabled:opacity-30 hover:bg-accent/80 transition-colors cursor-pointer disabled:cursor-not-allowed shrink-0">
                      <Send size={14} />
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
