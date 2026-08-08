import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import Hls from 'hls.js'
import { X, Radio, Wifi, ChevronLeft } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import ShareModal from '../components/ShareModal'

const LAST_CHANNEL_KEY = 'movy_last_channel'

const CHANNEL_CATS = [
  { key: 'general', label: 'Généraliste' },
  { key: 'news',    label: 'Info / News' },
  { key: 'sport',   label: 'Sport' },
  { key: 'kids',    label: 'Jeunesse' },
  { key: 'cinema',  label: 'Cinéma / Séries' },
  { key: 'music',   label: 'Musique' },
  { key: 'docu',    label: 'Documentaire' },
]

const CAT_RULES = [
  { key: 'news',   kw: ['bfm', 'lci', 'cnews', 'i24', 'euronews', 'lcp', 'sénat', 'news', 'info', 'actu', 'journal', 'rmc info', 'france info', 'bfmtv'] },
  { key: 'sport',  kw: ['sport', 'foot', 'football', 'tennis', 'golf', 'rugby', 'basket', 'equipe', 'eurosport', 'bein', 'canal+ sport', 'motorsport'] },
  { key: 'kids',   kw: ['kids', 'junior', 'tiji', 'gulli', 'tfou', 'cartoon', 'disney', 'nickelodeon', 'piwi', 'boomerang', 'canal j', 'jeunesse', 'mangas', 'anime'] },
  { key: 'cinema', kw: ['ciné', 'cine', 'cinéma', 'cinema', 'film', 'ocs', 'paramount', 'tcm', 'téva', 'teva', 'série club', 'serie club', 'action', 'thriller', 'comedie'] },
  { key: 'music',  kw: ['music', 'musique', 'mtv', 'mcm', 'nrj hits', 'm6 music', 'clubbing', 'hit tv'] },
  { key: 'docu',   kw: ['docu', 'discovery', 'national geo', 'nat geo', 'histoire', 'planète', 'planete', 'science', 'voyage', 'ushuaia', 'encyclop', 'arte'] },
]

function categorize(name) {
  const n = name.toLowerCase()
  for (const { key, kw } of CAT_RULES) {
    if (kw.some((k) => n.includes(k))) return key
  }
  return 'general'
}

export default function Channels() {
  const location = useLocation()
  const [countries, setCountries]   = useState([])
  const [country, setCountry]       = useState(null)
  const [channels, setChannels]     = useState([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState(null)
  const [active, setActive]         = useState(() => location.state?.channel ?? null)
  const [query, setQuery]           = useState('')
  const [activeTab, setActiveTab]   = useState('general')
  const [lastChannel, setLastChannel] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LAST_CHANNEL_KEY)) } catch { return null }
  })
  const cacheRef = useRef({})

  useEffect(() => {
    fetch(`/api/channels/countries`)
      .then((r) => r.json())
      .then(setCountries)
      .catch(() => {})
    if (location.state?.channel) window.history.replaceState({}, '')
  }, [])

  async function selectCountry(c) {
    setCountry(c)
    setQuery('')
    setActiveTab('general')
    if (cacheRef.current[c.code]) {
      setChannels(cacheRef.current[c.code])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch(`/api/channels?country=${c.code}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      cacheRef.current[c.code] = data
      setChannels(data)
    } catch (err) {
      setError(err.message)
      setChannels([])
    } finally {
      setLoading(false)
    }
  }

  const byCategory = useMemo(() => {
    const map = {}
    for (const ch of channels) {
      const k = categorize(ch.name)
      if (!map[k]) map[k] = []
      map[k].push(ch)
    }
    return map
  }, [channels])

  const tabs = useMemo(
    () => CHANNEL_CATS.filter((cat) => (byCategory[cat.key]?.length ?? 0) > 0),
    [byCategory]
  )

  const displayed = useMemo(() => {
    if (query.trim()) {
      const q = query.toLowerCase()
      return channels.filter((ch) => ch.name.toLowerCase().includes(q))
    }
    return byCategory[activeTab] ?? []
  }, [channels, byCategory, query, activeTab])

  const activeIdx = useMemo(
    () => displayed.findIndex((c) => c.url === active?.url),
    [displayed, active]
  )

  function switchChannel(idx) {
    if (idx >= 0 && idx < displayed.length) setActive(displayed[idx])
  }

  function openChannel(ch) {
    setActive(ch)
    setLastChannel(ch)
  }

  if (!country) {
    return (
      <div className="min-h-screen pb-36 pt-10 px-4 sm:px-8 max-w-screen-xl mx-auto">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <Radio size={22} className="text-accent" />
            <h1 className="font-display text-2xl sm:text-4xl text-warm tracking-wide">Chaînes TV</h1>
          </div>
          <p className="text-warm/30 text-sm">Sélectionne un pays</p>
        </div>

        {lastChannel && (
          <button
            onClick={() => setActive(lastChannel)}
            className="w-full mb-5 flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/8 hover:bg-white/8 hover:border-accent/20 transition-all text-left group cursor-pointer">
            <div className="w-10 h-10 rounded-lg bg-white/8 flex items-center justify-center overflow-hidden shrink-0">
              {lastChannel.logo
                ? <img src={lastChannel.logo} alt="" className="w-full h-full object-contain"
                    onError={(e) => { e.currentTarget.style.display = 'none' }} />
                : <Radio size={18} className="text-warm/30" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-warm/35 mb-0.5 uppercase tracking-wider">Reprendre</p>
              <p className="text-sm text-warm font-medium truncate">{lastChannel.name}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0 pr-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-warm/40 group-hover:text-warm transition-colors">Live</span>
            </div>
          </button>
        )}

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 sm:gap-3">
          {countries.map((c) => (
            <button key={c.code} onClick={() => selectCountry(c)}
              className="flex flex-col items-center gap-1.5 p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white/5 border border-white/8 hover:bg-white/10 hover:border-accent/30 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer">
              <span className="w-9 h-7 flex items-center justify-center rounded-md bg-white/10 text-xs font-bold text-warm/70 tracking-wider">{c.flag}</span>
              <span className="text-[10px] sm:text-[11px] text-warm/55 text-center leading-tight">{c.name}</span>
            </button>
          ))}
        </div>

        {active && (
          <LivePlayerOverlay
            channel={active}
            onClose={() => setActive(null)}
            channelList={[]}
            channelIndex={-1}
            onSwitch={() => {}}
          />
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-36 pt-10 px-4 sm:px-8 max-w-screen-xl mx-auto">
      <div className="mb-5 flex items-center gap-3">
        <button onClick={() => { setCountry(null); setChannels([]) }}
          className="p-2 rounded-xl text-warm/40 hover:text-warm hover:bg-white/8 transition-colors shrink-0">
          <ChevronLeft size={20} />
        </button>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="w-9 h-7 flex items-center justify-center rounded bg-white/10 text-xs font-bold text-warm/70 tracking-wider shrink-0">{country.flag}</span>
            <h1 className="font-display text-2xl sm:text-3xl text-warm tracking-wide truncate">{country.name}</h1>
          </div>
          <p className="text-warm/30 text-xs sm:text-sm">
            {loading ? 'Chargement…' : `${channels.length} chaîne${channels.length > 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-32 gap-3">
          <div className="w-8 h-8 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
          <p className="text-warm/40 text-sm">Chargement des chaînes…</p>
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-32 gap-3 text-center">
          <Wifi size={40} className="text-warm/20" />
          <p className="text-warm/40 text-sm">Impossible de charger les chaînes</p>
          <p className="text-warm/20 text-xs">{error}</p>
          <button onClick={() => { cacheRef.current[country.code] = null; selectCountry(country) }}
            className="mt-2 px-4 py-2 rounded-xl bg-white/8 text-warm/60 text-sm hover:bg-white/12 transition-colors">
            Réessayer
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="mb-6 flex flex-col gap-4">
            <input type="search" placeholder="Rechercher une chaîne…" value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full max-w-xs bg-white/5 border border-white/8 rounded-xl px-4 py-2.5 text-sm text-warm placeholder-warm/25 focus:outline-none focus:border-accent/40 transition-colors" />

            {!query.trim() && tabs.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {tabs.map((cat) => (
                  <button key={cat.key} onClick={() => setActiveTab(cat.key)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                      activeTab === cat.key
                        ? 'bg-accent text-white shadow-[0_0_16px_rgba(var(--accent-rgb),0.3)]'
                        : 'bg-white/5 text-warm/50 hover:bg-white/10 hover:text-warm border border-white/8'
                    }`}>
                    {cat.label}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      activeTab === cat.key ? 'bg-white/20 text-white' : 'bg-white/8 text-warm/35'
                    }`}>
                      {byCategory[cat.key]?.length ?? 0}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {displayed.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-32">
              <p className="text-warm/30 text-sm">
                {query.trim() ? 'Aucune chaîne trouvée' : 'Aucune chaîne'}
              </p>
            </div>
          ) : (
            <ChannelGrid channels={displayed} onSelect={openChannel} />
          )}
        </>
      )}

      {active && (
        <LivePlayerOverlay
          channel={active}
          onClose={() => setActive(null)}
          channelList={displayed}
          channelIndex={activeIdx}
          onSwitch={switchChannel}
        />
      )}
    </div>
  )
}

function ChannelGrid({ channels, onSelect }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2 sm:gap-3">
      {channels.map((ch, i) => (
        <button key={i} onClick={() => onSelect(ch)}
          className="flex flex-col items-center gap-1.5 p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-white/5 border border-white/8 hover:bg-white/10 hover:border-accent/30 hover:scale-105 active:scale-95 transition-all duration-200 group">
          <ChannelLogo logo={ch.logo} name={ch.name} />
          <span className="text-[9px] sm:text-[10px] text-warm/60 group-hover:text-warm text-center leading-tight line-clamp-2 transition-colors">
            {ch.name}
          </span>
        </button>
      ))}
    </div>
  )
}

function ChannelLogo({ logo, name }) {
  const [err, setErr] = useState(false)
  if (!logo || err) {
    return (
      <div className="w-12 h-12 rounded-lg bg-white/8 flex items-center justify-center">
        <Radio size={18} className="text-warm/30" />
      </div>
    )
  }
  return <img src={logo} alt={name} className="w-12 h-12 object-contain rounded-lg" onError={() => setErr(true)} />
}

function LivePlayerOverlay({ channel, onClose, channelList, channelIndex, onSwitch }) {
  const [showShare, setShowShare]       = useState(false)
  const [streamUrl, setStreamUrl]       = useState(null)
  const [resolveErr, setResolveErr]     = useState(null)
  const [showControls, setShowControls] = useState(true)
  const [altLoading, setAltLoading]     = useState(false)
  const controlsTimer = useRef(null)
  const overListRef   = useRef(false)
  const cardRef       = useRef(null)
  const [listHeight, setListHeight] = useState(null)
  const [isMobile, setIsMobile]     = useState(() => window.matchMedia('(max-width: 767px)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    if (!cardRef.current) return
    const obs = new ResizeObserver(([e]) => setListHeight(e.contentRect.height))
    obs.observe(cardRef.current)
    return () => obs.disconnect()
  }, [])

  // Resolve stream
  useEffect(() => {
    let cancelled = false
    setStreamUrl(null)
    setResolveErr(null)
    setAltLoading(false)
    fetch(`/api/live-resolve?url=${encodeURIComponent(channel.url)}&name=${encodeURIComponent(channel.name)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (data.stream) setStreamUrl(`/api/hls-proxy?url=${encodeURIComponent(data.stream)}`)
        else setResolveErr(data.error ?? 'Flux indisponible')
      })
      .catch(() => { if (!cancelled) setResolveErr('Flux indisponible') })
    return () => { cancelled = true }
  }, [channel.url])

  // Pre-fetch adjacent channels
  useEffect(() => {
    if (!channelList.length || channelIndex < 0) return
    [-1, 1, 2]
      .map((d) => channelIndex + d)
      .filter((i) => i >= 0 && i < channelList.length && i !== channelIndex)
      .forEach((i) => {
        const ch = channelList[i]
        fetch(`/api/live-resolve?url=${encodeURIComponent(ch.url)}&name=${encodeURIComponent(ch.name)}`).catch(() => {})
      })
  }, [channel.url, channelIndex, channelList])

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem(LAST_CHANNEL_KEY, JSON.stringify({
      name: channel.name,
      logo: channel.logo,
      url: channel.url,
    }))
  }, [channel])

  function tryAltSource() {
    setAltLoading(true)
    setStreamUrl(null)
    setResolveErr(null)
    fetch(`/api/live-resolve?url=${encodeURIComponent(channel.url)}&name=${encodeURIComponent(channel.name)}&source=alt`)
      .then((r) => r.json())
      .then((data) => {
        if (data.stream) setStreamUrl(`/api/hls-proxy?url=${encodeURIComponent(data.stream)}`)
        else setResolveErr(data.error ?? 'Aucune source alternative')
      })
      .catch(() => setResolveErr('Aucune source alternative'))
      .finally(() => setAltLoading(false))
  }

  // Auto-hide controls
  function resetControls() {
    setShowControls(true)
    clearTimeout(controlsTimer.current)
    controlsTimer.current = setTimeout(() => setShowControls(false), 3000)
  }

  useEffect(() => {
    resetControls()
    return () => clearTimeout(controlsTimer.current)
  }, [])

  // Keyboard navigation + close
  const navigate = useCallback((dir) => {
    if (!channelList.length || channelIndex < 0) return
    const next = channelIndex + dir
    if (next >= 0 && next < channelList.length) onSwitch(next)
  }, [channelIndex, channelList, onSwitch])

  useEffect(() => {
    const onKey = (e) => {
      if (showShare) return
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); navigate(1) }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft')  { e.preventDefault(); navigate(-1) }
    }
    const onWheel = (e) => {
      if (overListRef.current) return
      navigate(e.deltaY > 0 ? 1 : -1)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
    }
  }, [onClose, showShare, navigate])

  return (
    <div
      className={`fixed inset-0 z-[200] transition-colors duration-700 ${showControls ? 'bg-black/82' : 'bg-black'}`}
      onMouseMove={resetControls}
    >
      {/* Backdrop clic pour fermer */}
      <div className="absolute inset-0" onClick={onClose} />

      <AnimatePresence>
        {showShare && (
          <ShareModal
            shareData={{ type: 'share', kind: 'channel', name: channel.name, logo: channel.logo, url: channel.url }}
            onClose={() => setShowShare(false)}
          />
        )}
      </AnimatePresence>

      {/* Contenu centré */}
      <div className="absolute inset-0 overflow-y-auto flex flex-col md:justify-center p-4 pointer-events-none">
        <div className="flex flex-col md:flex-row md:items-start gap-4 w-full max-w-5xl mx-auto pointer-events-auto">

          {/* Carte vidéo */}
          <div ref={cardRef} className="flex-1 min-w-0 flex flex-col rounded-2xl overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.8)] border border-white/8">
            {/* En-tête — auto-masqué */}
            <div className={`flex items-center justify-between px-4 py-3 bg-zinc-900/95 backdrop-blur-md transition-opacity duration-300 ${isMobile || showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
              <div className="flex items-center gap-3">
                {channel.logo && (
                  <img src={channel.logo} alt="" className="h-7 object-contain rounded"
                    onError={(e) => { e.currentTarget.style.display = 'none' }} />
                )}
                <div>
                  <p className="text-warm font-semibold text-sm leading-tight">{channel.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-red-400 text-[10px] font-semibold tracking-widest uppercase">Live</span>
                    {channelIndex >= 0 && channelList.length > 0 && (
                      <span className="text-warm/30 text-[10px]">· {channelIndex + 1}/{channelList.length}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={tryAltSource} disabled={altLoading}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-warm/40 hover:text-warm hover:bg-white/8 transition-colors cursor-pointer disabled:opacity-40 text-[10px] font-medium"
                  title="Essayer une autre source">
                  {altLoading
                    ? <span className="w-3 h-3 border border-warm/40 border-t-warm rounded-full animate-spin inline-block" />
                    : <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>}
                  <span className="hidden sm:inline">Autre source</span>
                </button>
                <button onClick={() => setShowShare(true)}
                  className="p-1.5 rounded-lg text-warm/40 hover:text-warm hover:bg-white/8 transition-colors cursor-pointer"
                  title="Partager">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                </button>
                <button onClick={onClose}
                  className="p-1.5 rounded-lg text-warm/40 hover:text-warm hover:bg-white/8 transition-colors cursor-pointer">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Lecteur */}
            <div className="aspect-video bg-black w-full flex items-center justify-center">
              {resolveErr ? (
                <div className="flex flex-col items-center gap-2 text-center px-6">
                  <Wifi size={32} className="text-warm/20" />
                  <p className="text-warm/40 text-sm">{resolveErr}</p>
                </div>
              ) : !streamUrl ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-7 h-7 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
                  <p className="text-warm/30 text-xs">Résolution du flux…</p>
                </div>
              ) : (
                <HlsVideo src={streamUrl} />
              )}
            </div>
          </div>

          {/* Panneau liste */}
          {channelList.length > 1 && (isMobile || listHeight) && (
            <MiniChannelList
              channels={channelList}
              activeIndex={channelIndex}
              onSelect={onSwitch}
              height={isMobile ? undefined : listHeight}
              isMobile={isMobile}
              onMouseEnter={() => { overListRef.current = true }}
              onMouseLeave={() => { overListRef.current = false }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function MiniChannelList({ channels, activeIndex, onSelect, height, isMobile, onMouseEnter, onMouseLeave }) {
  const activeRef = useRef(null)

  useEffect(() => {
    if (!isMobile) activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeIndex, isMobile])

  return (
    <div
      className={`flex flex-col rounded-2xl border border-white/8 bg-zinc-900/98 shadow-[0_32px_80px_rgba(0,0,0,0.7)] overflow-hidden ${isMobile ? 'w-full' : 'w-60 shrink-0'}`}
      style={height != null ? { height } : undefined}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-3 shrink-0 border-b border-white/6">
        <p className="text-[10px] text-warm/35 uppercase tracking-[0.15em] font-semibold">Chaînes</p>
        <p className="text-warm/20 text-[9px] mt-0.5">
          {channels.length} disponibles{!isMobile && ' · ↑↓ pour zapper'}
        </p>
      </div>

      {/* Liste : flex-1 desktop (hauteur définie par parent), max-h-52 mobile */}
      <div className={`overflow-y-auto scrollbar-none py-2 px-2 ${isMobile ? 'max-h-52' : 'flex-1'}`}>
        {channels.map((ch, i) => (
          <button
            key={i}
            ref={i === activeIndex ? activeRef : null}
            onClick={() => onSelect(i)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 cursor-pointer mb-0.5 group ${
              i === activeIndex
                ? 'bg-white/10 ring-1 ring-white/15'
                : 'hover:bg-white/6'
            }`}
          >
            {/* Logo */}
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden transition-all ${
              i === activeIndex ? 'bg-white/12 ring-1 ring-accent/30' : 'bg-white/6'
            }`}>
              {ch.logo ? (
                <img src={ch.logo} alt="" className="w-full h-full object-contain p-0.5"
                  onError={(e) => { e.currentTarget.style.display = 'none' }} />
              ) : (
                <Radio size={13} className="text-warm/25" />
              )}
            </div>

            {/* Nom + badge live */}
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium truncate leading-tight transition-colors ${
                i === activeIndex ? 'text-warm' : 'text-warm/50 group-hover:text-warm/75'
              }`}>
                {ch.name}
              </p>
              {i === activeIndex && (
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="w-1 h-1 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[9px] text-red-400/80 uppercase tracking-wider font-medium">En direct</span>
                </div>
              )}
            </div>

            {/* Numéro */}
            <span className={`text-[10px] shrink-0 tabular-nums font-mono ${
              i === activeIndex ? 'text-accent font-bold' : 'text-warm/15 group-hover:text-warm/30'
            }`}>
              {i + 1}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function HlsVideo({ src }) {
  const videoRef   = useRef(null)
  const hlsRef     = useRef(null)
  const recoveries = useRef(0)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !src) return

    recoveries.current = 0

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker:                false,
        liveSyncDurationCount:       3,
        liveMaxLatencyDurationCount: 10,
        maxBufferLength:             30,
        maxMaxBufferLength:          60,
        fragLoadingTimeOut:          20000,
        manifestLoadingTimeOut:      15000,
      })
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.MANIFEST_PARSED, () => { video.play().catch(() => {}) })
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return
        if (recoveries.current < 4) {
          recoveries.current++
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setTimeout(() => { try { hls.startLoad() } catch {} }, 1500 * recoveries.current)
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            try { hls.recoverMediaError() } catch {}
          }
        }
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      video.play().catch(() => {})
    }

    return () => { hlsRef.current?.destroy(); hlsRef.current = null }
  }, [src])

  return <video ref={videoRef} controls playsInline autoPlay className="w-full h-full" />
}
