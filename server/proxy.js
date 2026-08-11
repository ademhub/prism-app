import puppeteerExtra from 'puppeteer-extra'
import StealthPlugin   from 'puppeteer-extra-plugin-stealth'

puppeteerExtra.use(StealthPlugin())

const CACHE_TTL = 5 * 60 * 60 * 1000  // 5 h
const urlCache  = new Map()
let   browser   = null

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getBrowser() {
  if (browser) {
    try { await browser.pages(); return browser } catch {}
  }
  browser = await puppeteerExtra.launch({
    headless: true,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--autoplay-policy=no-user-gesture-required',
    ],
  })
  return browser
}

const PLAYER_PRIORITY = ['Vidzy', 'Filemoon', 'Premium', 'Voe', 'Filmoon', 'Dood', 'Netu']

// Patterns d'URL publicitaires à ignorer lors de la capture
const AD_URL_RE = /doubleclick|googlesyndication|adservice|ad[s]?[./]|gads|imasdk|pagead/i

async function captureM3u8FromEmbed(embedUrl, referer = 'https://movix.fun/') {
  const br   = await getBrowser()
  const page = await br.newPage()
  try {
    await page.setViewport({ width: 1280, height: 720 })
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36')
    await page.setExtraHTTPHeaders({ Referer: referer })

    const m3u8Promise = new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 25000)
      const check = (url) => {
        if (!url.includes('.m3u8')) return
        if (AD_URL_RE.test(url)) return   // ignorer les pubs HLS
        clearTimeout(timer)
        resolve(url)
      }
      page.on('response', (r) => check(r.url()))
      page.on('request',  (r) => check(r.url()))
    })

    await page.goto(embedUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {})
    await sleep(3000)
    await page.mouse.click(640, 360)

    return await m3u8Promise
  } finally {
    try { await page.close() } catch {}
  }
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// ── frembed — HLS direct (sans pub) ──────────────────────────────────────────
// Ouvre l'embed en headless, capture le .m3u8 brut, retourne type:hls.
// Fallback vers type:embed si Puppeteer échoue ou dépasse le timeout.

async function tryFrembedHls(tmdbId, mediaType, season, episode) {
  try {
    const isTv    = mediaType !== 'movie'
    const apiType = isTv ? 'series' : 'movies'

    // Vérifie que frembed a ce contenu
    const res = await fetch(
      `https://frembed.casa/api/public/v1/${apiType}/${tmdbId}`,
      { headers: { 'User-Agent': UA, Referer: 'https://movix.fun/' }, signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return null
    const data = await res.json()
    if (!data.result?.items?.length) return null

    const embedType = isTv ? 'serie' : 'movie'
    let embedUrl = `https://frembed.casa/embed/${embedType}/${tmdbId}`
    if (isTv && season && episode) embedUrl += `?sa=${season}&epi=${episode}`

    console.log(`[proxy] Puppeteer frembed HLS → ${embedUrl.slice(0, 80)}`)
    const m3u8 = await captureM3u8FromEmbed(embedUrl, 'https://frembed.casa/')

    if (m3u8) {
      console.log('[proxy] ✓ HLS capturé (sans pub) :', m3u8.slice(0, 80))
      return { url: m3u8, type: 'hls' }
    }

    // Puppeteer n'a pas capturé de stream → fallback embed (pubs présentes)
    console.log('[proxy] capture HLS échouée, fallback embed frembed')
    return { url: embedUrl, type: 'embed' }
  } catch (err) {
    console.error('[proxy] tryFrembedHls erreur:', err.message)
    return null
  }
}

// ── Sources embed alternatives ────────────────────────────────────────────────

function buildEmbedUrl(source, tmdbId, mediaType, season, episode) {
  const isTv = mediaType !== 'movie'
  switch (source) {
    case 'vidsrc.to':
      if (isTv && season && episode) return `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}`
      return isTv ? `https://vidsrc.to/embed/tv/${tmdbId}` : `https://vidsrc.to/embed/movie/${tmdbId}`
    case 'vidsrc.me':
      if (isTv && season && episode) return `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`
      return isTv ? `https://vidsrc.me/embed/tv?tmdb=${tmdbId}` : `https://vidsrc.me/embed/movie?tmdb=${tmdbId}`
    case '2embed':
      if (isTv && season && episode) return `https://www.2embed.cc/embedtv/${tmdbId}&s=${season}&e=${episode}`
      return `https://www.2embed.cc/embed/${tmdbId}`
    case 'multiembed':
      if (isTv && season && episode) return `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${season}&e=${episode}`
      return isTv ? `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1` : `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`
    default: return null
  }
}

async function tryEmbedSources(tmdbId, mediaType, season, episode) {
  const sources = ['vidsrc.me', 'vidsrc.to', 'multiembed', '2embed']
  for (const source of sources) {
    const url = buildEmbedUrl(source, tmdbId, mediaType, season, episode)
    if (!url) continue
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        console.log(`[proxy] ✓ ${source}: ${url}`)
        return url
      }
    } catch {
      console.log(`[proxy] ✗ ${source} injoignable`)
    }
  }
  return null
}

// ── fstream + Puppeteer (fallback) ───────────────────────────────────────────

async function tryFstream(tmdbId, mediaType) {
  try {
    const res = await fetch(
      `https://api.movix.fun/api/fstream/${mediaType}/${tmdbId}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Referer: 'https://movix.fun/',
          Origin:  'https://movix.fun',
        },
      }
    )
    if (!res.ok) return null
    const data = await res.json()

    const allPlayers = [
      ...(data.players?.VFQ    ?? []),
      ...(data.players?.VFF    ?? []),
      ...(data.players?.Default ?? []),
      ...(data.players?.VOSTFR ?? []),
    ]

    let embedUrl = null
    for (const pref of PLAYER_PRIORITY) {
      const p = allPlayers.find((x) => x.player === pref)
      if (p) { embedUrl = p.url; console.log(`[proxy] fstream player: ${p.player}`); break }
    }
    if (!embedUrl && allPlayers.length) embedUrl = allPlayers[0].url
    if (!embedUrl) return null

    console.log(`[proxy] Puppeteer → embed: ${embedUrl.slice(0, 80)}`)
    const m3u8 = await captureM3u8FromEmbed(embedUrl)
    return m3u8 ? { url: m3u8, type: 'hls' } : null
  } catch (err) {
    console.error('[proxy] fstream erreur:', err.message)
    return null
  }
}

// ── Export principal ──────────────────────────────────────────────────────────

const TV_EMBED_SOURCES = (tmdbId, season, episode) => [
  `https://frembed.casa/embed/serie/${tmdbId}?sa=${season}&epi=${episode}`,
  `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`,
  `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}`,
  `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${season}&e=${episode}`,
]

export async function getStreamUrl(tmdbId, mediaType = 'movie', season = null, episode = null, sourceIdx = 0) {
  const key    = season && episode
    ? `${mediaType}:${tmdbId}:s${season}e${episode}:src${sourceIdx}`
    : `${mediaType}:${tmdbId}`

  const cached = urlCache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    console.log(`[proxy] cache hit ${key}`)
    return cached
  }

  console.log(`[proxy] Récupération ${key}`)

  // ── Séries TV ─────────────────────────────────────────────────────────────
  if (mediaType === 'tv' && season && episode) {
    // sourceIdx 0 → tente HLS sans pub, puis fallback embed[0]
    if (sourceIdx === 0) {
      const frembedHls = await tryFrembedHls(tmdbId, mediaType, season, episode)
      if (frembedHls) {
        urlCache.set(key, { ...frembedHls, at: Date.now() })
        return frembedHls
      }
    }
    // sourceIdx > 0 ou HLS échoué → embed sources classiques
    const sources = TV_EMBED_SOURCES(tmdbId, season, episode)
    const idx     = Math.min(Math.max(0, sourceIdx - 1), sources.length - 1)
    const url     = sources[idx]
    console.log(`[proxy] ✓ TV embed src${idx}: ${url}`)
    const result = { url, type: 'embed', totalSources: sources.length + 1 }
    urlCache.set(key, { ...result, at: Date.now() })
    return result
  }

  // ── Films ─────────────────────────────────────────────────────────────────
  // 1) Frembed HLS (sans pub) — capture Puppeteer, fallback embed intégré
  const frembedResult = await tryFrembedHls(tmdbId, mediaType, season, episode)
  if (frembedResult) {
    urlCache.set(key, { ...frembedResult, at: Date.now() })
    return frembedResult
  }

  // 2) Sources embed alternatives (vidsrc, multiembed, 2embed)
  console.log('[proxy] frembed indisponible, essai sources alternatives...')
  const embedUrl = await tryEmbedSources(tmdbId, mediaType, season, episode)
  if (embedUrl) {
    const result = { url: embedUrl, type: 'embed' }
    urlCache.set(key, { ...result, at: Date.now() })
    return result
  }

  // 3) fstream + Puppeteer (dernier recours)
  console.log('[proxy] essai fstream+Puppeteer...')
  const hlsResult = await tryFstream(tmdbId, mediaType)
  if (hlsResult) {
    urlCache.set(key, { ...hlsResult, at: Date.now() })
    return hlsResult
  }

  console.log('[proxy] ✗ aucun stream trouvé')
  return null
}
