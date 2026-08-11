const CACHE_TTL = 5 * 60 * 60 * 1000  // 5 h
const urlCache  = new Map()

// ── Sources films (6 providers, switchables) ──────────────────────────────────

const MOVIE_SOURCES = (tmdbId) => [
  `https://frembed.casa/embed/movie/${tmdbId}`,
  `https://vidsrc.to/embed/movie/${tmdbId}`,
  `https://embed.su/embed/movie/${tmdbId}`,
  `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`,
  `https://vidsrc.me/embed/movie?tmdb=${tmdbId}`,
  `https://www.2embed.cc/embed/${tmdbId}`,
]

// ── Sources séries TV (4 providers, switchables) ──────────────────────────────

const TV_EMBED_SOURCES = (tmdbId, season, episode) => [
  `https://vidsrc.to/embed/tv/${tmdbId}/${season}/${episode}`,
  `https://embed.su/embed/tv/${tmdbId}/${season}/${episode}`,
  `https://frembed.casa/embed/serie/${tmdbId}?sa=${season}&epi=${episode}`,
  `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}`,
  `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1&s=${season}&e=${episode}`,
]

// ── Export principal ──────────────────────────────────────────────────────────

export async function getStreamUrl(tmdbId, mediaType = 'movie', season = null, episode = null, sourceIdx = 0) {
  const key = season && episode
    ? `${mediaType}:${tmdbId}:s${season}e${episode}:src${sourceIdx}`
    : `${mediaType}:${tmdbId}:src${sourceIdx}`

  const cached = urlCache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL) {
    console.log(`[proxy] cache hit ${key}`)
    return cached
  }

  console.log(`[proxy] Récupération ${key}`)

  if (mediaType === 'tv' && season && episode) {
    const sources = TV_EMBED_SOURCES(tmdbId, season, episode)
    const idx = Math.min(sourceIdx, sources.length - 1)
    const result = { url: sources[idx], type: 'embed', totalSources: sources.length }
    urlCache.set(key, { ...result, at: Date.now() })
    console.log(`[proxy] ✓ TV src${idx}: ${sources[idx]}`)
    return result
  }

  // Films — liste fixe de 6 sources
  const sources = MOVIE_SOURCES(tmdbId)
  const idx = Math.min(sourceIdx, sources.length - 1)
  const result = { url: sources[idx], type: 'embed', totalSources: sources.length }
  urlCache.set(key, { ...result, at: Date.now() })
  console.log(`[proxy] ✓ film src${idx}: ${sources[idx]}`)
  return result
}
