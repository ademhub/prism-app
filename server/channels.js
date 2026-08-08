import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir     = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = join(__dir, 'channels-cache')
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true })

const FREMBED_BASE = 'https://frembed.casa'
const UA           = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const GROUP_TTL    = 60 * 60 * 1000   // 1 h for channel lists
const GROUPS_FILE  = join(CACHE_DIR, 'frembed-groups.json')

// ── In-memory caches ─────────────────────────────────────────────────────────
let _groups    = null
let _groupsAt  = 0
const _ch      = {}   // { [group]: { channels, at } }

function groupFlag(group) {
  const g = (group || '').toLowerCase()
  if (g === 'france sport')                                                      return 'FS'
  if (g.includes('france'))                                                      return 'FR'
  if (g.includes('arab'))                                                        return 'AR'
  if (g.includes('balkans'))                                                     return 'BK'
  if (g.includes('albania'))                                                     return 'AL'
  if (g.includes('bulgaria'))                                                    return 'BG'
  if (g.includes('croatia'))                                                     return 'HR'
  if (g.includes('germany') || g.includes('deutsch'))                            return 'DE'
  if (g.includes('italy') || g.includes('italia'))                               return 'IT'
  if (g.includes('netherlands'))                                                 return 'NL'
  if (g.includes('poland'))                                                      return 'PL'
  if (g.includes('portugal'))                                                    return 'PT'
  if (g.includes('romania'))                                                     return 'RO'
  if (g.includes('russia'))                                                      return 'RU'
  if (g.includes('spain') || g.includes('espagne'))                              return 'ES'
  if (g.includes('turkey'))                                                      return 'TR'
  if (g.includes('united kingdom') || g === 'uk')                                return 'UK'
  if (g.includes('maroc'))                                                       return 'MA'
  if (g.includes('algerie') || g.includes('algeria'))                            return 'DZ'
  if (g.includes('tunisie') || g.includes('tunisia'))                            return 'TN'
  if (g.includes('egypt'))                                                       return 'EG'
  const words = group.trim().split(/\s+/)
  return words.length >= 2
    ? (words[0][0] + words[1][0]).toUpperCase()
    : group.slice(0, 2).toUpperCase()
}

function groupSortKey(group) {
  const g = (group || '').toLowerCase()
  if (g === 'france' || g === 'france sport') return '0' + group
  if (g.startsWith('france'))  return '1' + group
  if (g.startsWith('arab'))    return '2' + group
  return '3' + group
}

async function fetchPage(cursor) {
  const res = await fetch(`${FREMBED_BASE}/api/live-new/catalog?cursor=${cursor}`, {
    headers: { 'User-Agent': UA, Referer: FREMBED_BASE },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Frembed HTTP ${res.status}`)
  const data = await res.json()
  if (!data.success) throw new Error(data.message || 'Catalog error')
  return data
}

// ── Groups list (fast: only fetches page 0) ───────────────────────────────────
export async function getGroups() {
  const now = Date.now()
  if (_groups && now - _groupsAt < GROUP_TTL) {
    return _groups.map((g) => ({ code: g, name: g, flag: groupFlag(g) }))
  }
  if (existsSync(GROUPS_FILE)) {
    try {
      const saved = JSON.parse(readFileSync(GROUPS_FILE, 'utf8'))
      if (now - saved.at < GROUP_TTL) {
        _groups  = saved.groups
        _groupsAt = saved.at
        return _groups.map((g) => ({ code: g, name: g, flag: groupFlag(g) }))
      }
    } catch {}
  }

  const data  = await fetchPage(0)
  const raw   = Array.isArray(data.groups) ? data.groups : []
  _groups     = raw.sort((a, b) => groupSortKey(a).localeCompare(groupSortKey(b)))
  _groupsAt   = now
  try { writeFileSync(GROUPS_FILE, JSON.stringify({ groups: _groups, at: now })) } catch {}
  return _groups.map((g) => ({ code: g, name: g, flag: groupFlag(g) }))
}

// ── Channels for a group (parallel fetch, early-stop, disk cache) ─────────────
function groupCacheFile(group) {
  return join(CACHE_DIR, `group-${group.replace(/[^a-zA-Z0-9]/g, '_')}.json`)
}

const _inFlight = {}  // prevent duplicate parallel requests for same group

export async function getChannelsByGroup(group) {
  const now = Date.now()

  if (_ch[group] && now - _ch[group].at < GROUP_TTL) return _ch[group].channels

  const file = groupCacheFile(group)
  if (existsSync(file)) {
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8'))
      if (now - saved.at < GROUP_TTL) {
        _ch[group] = { channels: saved.channels, at: saved.at }
        return saved.channels
      }
    } catch {}
  }

  if (_inFlight[group]) return _inFlight[group]

  _inFlight[group] = (async () => {
    const channels = []
    let cursor    = 0
    let seenGroup = false
    const BATCH   = 4   // fetch 4 pages in parallel

    for (let batch = 0; batch < 30; batch++) {
      const cursors = Array.from({ length: BATCH }, (_, k) => cursor + k * 300)
      const pages   = await Promise.all(cursors.map((c) => fetchPage(c).catch(() => null)))

      let done = false
      let lastValid = false
      for (const page of pages) {
        if (!page) continue
        lastValid = true
        let hasGroup = false
        for (const ch of (page.items ?? [])) {
          if (ch.group === group) {
            hasGroup = true
            seenGroup = true
            channels.push({ name: ch.name, logo: ch.logo || null, url: ch.url, group })
          }
        }
        if (seenGroup && !hasGroup) { done = true; break }
        if (!page.nextCursor)       { done = true; break }
      }
      if (done || !lastValid) break
      cursor += BATCH * 300
    }

    channels.sort((a, b) => a.name.localeCompare(b.name))
    const at = Date.now()
    _ch[group] = { channels, at }
    try { writeFileSync(groupCacheFile(group), JSON.stringify({ channels, at })) } catch {}
    console.log(`[channels] ${group}: ${channels.length} chaînes`)
    return channels
  })()

  try {
    return await _inFlight[group]
  } finally {
    delete _inFlight[group]
  }
}

// ── Resolve live stream URL ───────────────────────────────────────────────────
export async function resolveLiveStream(url) {
  const res = await fetch(`${FREMBED_BASE}/api/live-new/resolve?url=${encodeURIComponent(url)}`, {
    headers: { 'User-Agent': UA, Referer: FREMBED_BASE },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  if (!data.success || !data.stream) throw new Error(data.message || 'Flux indisponible')
  return data.stream
}

// ── iptv-org fallback ─────────────────────────────────────────────────────────
const IPTVORG_CACHE_FILE = join(CACHE_DIR, 'iptvorg-map.json')
const IPTVORG_TTL        = 24 * 60 * 60 * 1000  // 24 h

let _iptvMap = null
let _iptvAt  = 0

function normName(name) {
  return name.toLowerCase()
    .replace(/\b(hd|sd|fhd|4k|uhd|vf|vost|fr|en|\+\d)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

async function loadIptvOrgMap() {
  if (_iptvMap && Date.now() - _iptvAt < IPTVORG_TTL) return _iptvMap

  if (existsSync(IPTVORG_CACHE_FILE)) {
    try {
      const { map, at } = JSON.parse(readFileSync(IPTVORG_CACHE_FILE, 'utf8'))
      if (Date.now() - at < IPTVORG_TTL) {
        _iptvMap = map; _iptvAt = at
        return _iptvMap
      }
    } catch {}
  }

  console.log('[iptv-org] téléchargement du catalogue…')
  const [chRes, stRes] = await Promise.all([
    fetch('https://iptv-org.github.io/api/channels.json', { signal: AbortSignal.timeout(20000) }),
    fetch('https://iptv-org.github.io/api/streams.json',  { signal: AbortSignal.timeout(20000) }),
  ])
  const channels = await chRes.json()
  const streams  = await stRes.json()

  const idToName = {}
  for (const ch of channels) idToName[ch.id] = ch.name

  const map = {}
  for (const s of streams) {
    if (!s.channel || !s.url || s.status === 'error') continue
    const name = idToName[s.channel]
    if (!name) continue
    const key = normName(name)
    if (!map[key]) map[key] = []
    map[key].push(s.url)
  }

  _iptvMap = map; _iptvAt = Date.now()
  try { writeFileSync(IPTVORG_CACHE_FILE, JSON.stringify({ map, at: _iptvAt })) } catch {}
  console.log(`[iptv-org] ${Object.keys(map).length} chaînes indexées`)
  return map
}

export async function iptvOrgFallback(channelName) {
  try {
    const map = await loadIptvOrgMap()
    const key = normName(channelName)

    if (map[key]?.length) return map[key][0]

    // Recherche partielle si pas de correspondance exacte
    for (const [k, urls] of Object.entries(map)) {
      if (k.length >= 4 && (k.includes(key) || key.includes(k))) return urls[0]
    }
  } catch (err) {
    console.error('[iptv-org] fallback:', err.message)
  }
  return null
}

export async function preloadIptvOrg() {
  loadIptvOrgMap().catch((err) => console.error('[iptv-org] preload:', err.message))
}

// ── Startup preload ───────────────────────────────────────────────────────────
export async function prefetchFrance() {
  try {
    await getGroups()
    await getChannelsByGroup('France')
    console.log('[channels] préchargement France OK')
  } catch (err) {
    console.error('[channels] préchargement:', err.message)
  }
}
