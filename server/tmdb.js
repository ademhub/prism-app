const TMDB_BASE     = 'https://api.themoviedb.org/3'
const WATCH_REGION  = process.env.WATCH_REGION ?? 'FR'
const RATE_DELAY_MS = 280

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function tmdbGet(path, params = {}) {
  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) throw new Error('TMDB_API_KEY non défini dans .env')

  const url = new URL(`${TMDB_BASE}${path}`)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('language', 'fr-FR')
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v))
  }

  const res = await fetch(url)
  if (!res.ok) throw new Error(`TMDB HTTP ${res.status} sur ${path}`)
  return res.json()
}

async function searchMovie(titre, annee) {
  const params = { query: titre }
  if (annee) params.year = annee
  const data = await tmdbGet('/search/movie', params)
  return data.results?.[0] ?? null
}

function extractPosterPath(url) {
  if (!url) return null
  try {
    const p = new URL(url).pathname
    const m = p.match(/\/t\/p\/[^/]+(.+)/)
    return m?.[1] ?? null
  } catch { return null }
}

// ─── Schema ──────────────────────────────────────────────────────────────────

export function initTmdbSchema(db) {
  const newCols = [
    ['tmdb_id',         'INTEGER'],
    ['titre_officiel',  'TEXT'],
    ['synopsis',        'TEXT'],
    ['poster_path',     'TEXT'],
    ['backdrop_path',   'TEXT'],
    ['note',            'REAL'],
    ['genres',          'TEXT'],
    ['duree',           'INTEGER'],
    ['enriched_at',     'TEXT'],
    ['media_type',      'TEXT'],
    ['watch_providers', 'TEXT'],
    ['saisons',         'TEXT'],
  ]

  const existing = new Set(
    db.prepare('PRAGMA table_info(media)').all().map((c) => c.name)
  )
  for (const [col, type] of newCols) {
    if (!existing.has(col)) db.exec(`ALTER TABLE media ADD COLUMN ${col} ${type}`)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS media_cast (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      media_id   INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
      nom        TEXT    NOT NULL,
      photo_path TEXT,
      ordre      INTEGER NOT NULL
    )
  `)
}

// ─── Prepared statement helpers ───────────────────────────────────────────────

const makeUpdateMedia = (db) =>
  db.prepare(`
    UPDATE media SET
      tmdb_id         = @tmdb_id,
      titre_officiel  = @titre_officiel,
      synopsis        = @synopsis,
      poster_path     = @poster_path,
      backdrop_path   = @backdrop_path,
      note            = @note,
      genres          = @genres,
      duree           = @duree,
      enriched_at     = @enriched_at,
      media_type      = @media_type,
      watch_providers = @watch_providers,
      saisons         = @saisons,
      is_adult        = @is_adult
    WHERE id = @id
  `)

const makeMarkAttempted = (db) =>
  db.prepare(`UPDATE media SET enriched_at = ? WHERE id = ?`)

const makeDeleteCast  = (db) => db.prepare(`DELETE FROM media_cast WHERE media_id = ?`)
const makeInsertActor = (db) => db.prepare(
  `INSERT INTO media_cast (media_id, nom, photo_path, ordre)
   VALUES (@media_id, @nom, @photo_path, @ordre)`
)

// ─── Seasons helper ──────────────────────────────────────────────────────────

export async function fetchTvSaisonsAndStore(db, mediaId, tmdbId, nbSaisons) {
  const saisons = await fetchTvSaisons(tmdbId, nbSaisons)
  db.prepare('UPDATE media SET saisons = ? WHERE id = ?').run(JSON.stringify(saisons), mediaId)
  return saisons
}

async function fetchTvSaisons(tmdbId, nbSaisons) {
  const saisons = {}
  for (let s = 1; s <= nbSaisons; s++) {
    try {
      const data = await tmdbGet(`/tv/${tmdbId}/season/${s}`)
      saisons[s] = (data.episodes ?? []).map((ep) => ({
        episode:  ep.episode_number,
        titre:    ep.name,
        synopsis: ep.overview,
        duree:    ep.runtime ?? null,
        date:     ep.air_date ?? null,
        still:    ep.still_path ?? null,
      }))
      await sleep(RATE_DELAY_MS)
    } catch {
      // saison inaccessible, on continue
    }
  }
  return saisons
}

// ─── Watch providers helper ───────────────────────────────────────────────────

function parseWatchProviders(watchData) {
  const regionData = watchData.results?.[WATCH_REGION] ?? null
  if (!regionData) return null
  return JSON.stringify({
    flatrate: regionData.flatrate ?? [],
    rent:     regionData.rent     ?? [],
    buy:      regionData.buy      ?? [],
    link:     regionData.link     ?? null,
  })
}

// ─── Enrichissement par titre (fichiers locaux) ───────────────────────────────

async function enrichOne(db, row, stmts) {
  const hit = await searchMovie(row.titre_brut, row.annee_devinee)
  await sleep(RATE_DELAY_MS)

  if (!hit) {
    stmts.markAttempted.run(new Date().toISOString(), row.id)
    return false
  }

  const [details, credits, watchData] = await Promise.all([
    tmdbGet(`/movie/${hit.id}`),
    tmdbGet(`/movie/${hit.id}/credits`),
    tmdbGet(`/movie/${hit.id}/watch/providers`),
  ])
  await sleep(RATE_DELAY_MS)

  const cast   = (credits.cast ?? []).slice(0, 5)
  const genres = JSON.stringify((details.genres ?? []).map((g) => g.name))

  db.transaction(() => {
    stmts.update.run({
      id:              row.id,
      tmdb_id:         hit.id,
      titre_officiel:  details.title,
      synopsis:        details.overview,
      poster_path:     details.poster_path,
      backdrop_path:   details.backdrop_path,
      note:            details.vote_average,
      genres,
      duree:           details.runtime,
      enriched_at:     new Date().toISOString(),
      media_type:      'movie',
      watch_providers: parseWatchProviders(watchData),
      saisons:         null,
      is_adult:        details.adult ? 1 : 0,
    })

    stmts.deleteCast.run(row.id)
    for (let i = 0; i < cast.length; i++) {
      stmts.insertActor.run({
        media_id:   row.id,
        nom:        cast[i].name,
        photo_path: cast[i].profile_path ?? null,
        ordre:      i,
      })
    }
  })()

  return true
}

// ─── Enrichissement par tmdb_id connu (Frembed bulk) ─────────────────────────

// skipSaisons=true en mode bulk pour aller vite (saisons chargées à la demande)
async function enrichOneById(db, row, stmts, skipSaisons = false) {
  const mediaType = row.media_type ?? 'movie'
  const tmdbId    = row.tmdb_id

  const base = mediaType === 'movie' ? `/movie/${tmdbId}` : `/tv/${tmdbId}`

  const [details, credits, watchData] = await Promise.all([
    tmdbGet(base),
    tmdbGet(`${base}/credits`),
    tmdbGet(`${base}/watch/providers`),
  ])
  await sleep(RATE_DELAY_MS)

  const titre = (mediaType === 'movie' ? details.title : details.name) ?? row.titre_brut
  const duree = mediaType === 'movie'
    ? details.runtime
    : (details.episode_run_time?.[0] ?? null)

  const cast   = (credits.cast ?? []).slice(0, 5)
  const genres = JSON.stringify((details.genres ?? []).map((g) => g.name))

  let saisons = null
  if (!skipSaisons && mediaType === 'tv' && (details.number_of_seasons ?? 0) > 0) {
    saisons = await fetchTvSaisons(tmdbId, details.number_of_seasons)
  }

  db.transaction(() => {
    stmts.update.run({
      id:              row.id,
      tmdb_id:         tmdbId,
      titre_officiel:  titre,
      synopsis:        details.overview,
      poster_path:     details.poster_path,
      backdrop_path:   details.backdrop_path,
      note:            details.vote_average,
      genres,
      duree,
      enriched_at:     new Date().toISOString(),
      media_type:      mediaType,
      watch_providers: parseWatchProviders(watchData),
      saisons:         saisons ? JSON.stringify(saisons) : null,
    })

    stmts.deleteCast.run(row.id)
    for (let i = 0; i < cast.length; i++) {
      stmts.insertActor.run({
        media_id:   row.id,
        nom:        cast[i].name,
        photo_path: cast[i].profile_path ?? null,
        ordre:      i,
      })
    }
  })()

  return true
}

// ─── Enrichissement global ────────────────────────────────────────────────────

export async function enrichAllMedia(db) {
  const stmts = {
    update:        makeUpdateMedia(db),
    markAttempted: makeMarkAttempted(db),
    deleteCast:    makeDeleteCast(db),
    insertActor:   makeInsertActor(db),
  }

  let enriched = 0, skipped = 0, total = 0
  const CONCURRENCY = 3

  // 1. Records avec tmdb_id connu — TV en premier, puis films
  const withId = db
    .prepare('SELECT id, tmdb_id, media_type FROM media WHERE enriched_at IS NULL AND tmdb_id IS NOT NULL ORDER BY media_type DESC')
    .all()

  total += withId.length

  // Traitement en mini-lots parallèles pour accélérer
  for (let i = 0; i < withId.length; i += CONCURRENCY) {
    const batch = withId.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map(async (row) => {
      try {
        const ok = await enrichOneById(db, row, stmts, row.media_type === 'tv')
        ok ? enriched++ : skipped++
      } catch (err) {
        console.error(`[enrich] tmdb:${row.tmdb_id}: ${err.message}`)
        stmts.markAttempted.run(new Date().toISOString(), row.id)
        skipped++
      }
    }))
    await sleep(RATE_DELAY_MS)
    if ((i / CONCURRENCY) % 100 === 0 && i > 0) {
      console.log(`[enrich] ${enriched + skipped}/${withId.length} traités (${enriched} ok)`)
    }
  }

  // 2. Records sans tmdb_id (fichiers locaux) — recherche par titre
  const withoutId = db
    .prepare('SELECT id, titre_brut, annee_devinee FROM media WHERE enriched_at IS NULL AND tmdb_id IS NULL')
    .all()

  total += withoutId.length
  for (const row of withoutId) {
    try {
      await enrichOne(db, row, stmts) ? enriched++ : skipped++
    } catch (err) {
      console.error(`[tmdb] "${row.titre_brut}": ${err.message}`)
      skipped++
      await sleep(RATE_DELAY_MS)
    }
  }

  return { total, enriched, skipped }
}

// ─── Import TMDB direct (complet, avec appels TMDB) ──────────────────────────

export async function importFromTmdb(db, tmdbId, mediaType = 'movie') {
  const filepath = `tmdb://${mediaType}/${tmdbId}`

  const existing = db.prepare('SELECT id FROM media WHERE filepath = ? OR tmdb_id = ?').get(filepath, tmdbId)
  if (existing) return { id: existing.id, status: 'already_exists' }

  const base = mediaType === 'movie' ? `/movie/${tmdbId}` : `/tv/${tmdbId}`

  const [details, credits, watchData] = await Promise.all([
    tmdbGet(base),
    tmdbGet(`${base}/credits`),
    tmdbGet(`${base}/watch/providers`),
  ])
  await sleep(RATE_DELAY_MS)

  const titre = mediaType === 'movie' ? details.title : details.name
  const annee = parseInt(
    (mediaType === 'movie' ? details.release_date : details.first_air_date)?.slice(0, 4)
  ) || null
  const duree = mediaType === 'movie'
    ? details.runtime
    : (details.episode_run_time?.[0] ?? null)

  const cast   = (credits.cast ?? []).slice(0, 5)
  const genres = JSON.stringify((details.genres ?? []).map((g) => g.name))

  let saisons = null
  if (mediaType === 'tv' && details.number_of_seasons > 0) {
    saisons = await fetchTvSaisons(tmdbId, details.number_of_seasons)
  }

  const stmtInsert = db.prepare(`
    INSERT INTO media (filepath, titre_brut, annee_devinee, type, source)
    VALUES (@filepath, @titre_brut, @annee_devinee, 'stream', 'tmdb')
    ON CONFLICT (filepath) DO NOTHING
  `)
  const stmtUpdate = db.prepare(`
    UPDATE media SET
      tmdb_id         = @tmdb_id,
      titre_officiel  = @titre_officiel,
      synopsis        = @synopsis,
      poster_path     = @poster_path,
      backdrop_path   = @backdrop_path,
      note            = @note,
      genres          = @genres,
      duree           = @duree,
      enriched_at     = @enriched_at,
      media_type      = @media_type,
      watch_providers = @watch_providers,
      saisons         = @saisons,
      is_adult        = @is_adult
    WHERE filepath = @filepath
  `)
  const stmtId      = db.prepare('SELECT id FROM media WHERE filepath = ?')
  const stmtDelCast = db.prepare('DELETE FROM media_cast WHERE media_id = ?')
  const stmtActor   = db.prepare(
    `INSERT INTO media_cast (media_id, nom, photo_path, ordre) VALUES (@media_id, @nom, @photo_path, @ordre)`
  )

  db.transaction(() => {
    stmtInsert.run({ filepath, titre_brut: titre, annee_devinee: annee })
    const row = stmtId.get(filepath)
    if (!row) return

    stmtUpdate.run({
      filepath,
      tmdb_id:         tmdbId,
      titre_officiel:  titre,
      synopsis:        details.overview,
      poster_path:     details.poster_path,
      backdrop_path:   details.backdrop_path,
      note:            details.vote_average,
      genres,
      duree,
      enriched_at:     new Date().toISOString(),
      media_type:      mediaType,
      watch_providers: parseWatchProviders(watchData),
      saisons:         saisons ? JSON.stringify(saisons) : null,
      is_adult:        details.adult ? 1 : 0,
    })

    stmtDelCast.run(row.id)
    for (let i = 0; i < cast.length; i++) {
      stmtActor.run({ media_id: row.id, nom: cast[i].name, photo_path: cast[i].profile_path ?? null, ordre: i })
    }
  })()

  const inserted = stmtId.get(filepath)
  console.log(`[import] ✓ ${mediaType} "${titre}" (tmdb:${tmdbId}) → id=${inserted?.id}`)
  return { id: inserted?.id, titre, status: 'imported' }
}

export async function searchAndImport(db, query, mediaType = 'movie') {
  const endpoint = mediaType === 'movie' ? '/search/movie' : '/search/tv'
  const data     = await tmdbGet(endpoint, { query })
  const result   = data.results?.[0]
  if (!result) throw new Error(`Aucun résultat TMDB pour "${query}"`)
  return importFromTmdb(db, result.id, mediaType)
}

export async function importPopular(db, pages = 1) {
  let total = 0
  for (const mediaType of ['movie', 'tv']) {
    const endpoint = mediaType === 'movie' ? '/movie/popular' : '/tv/popular'
    for (let page = 1; page <= pages; page++) {
      const data = await tmdbGet(endpoint, { page })
      for (const item of data.results ?? []) {
        try {
          const res = await importFromTmdb(db, item.id, mediaType)
          if (res.status === 'imported') total++
          await sleep(RATE_DELAY_MS)
        } catch (err) {
          console.error(`[import] ${mediaType}/${item.id}: ${err.message}`)
        }
      }
    }
  }
  return total
}

// ─── Import Frembed (quelques pages, enrichissement TMDB immédiat) ────────────

export async function importFromFrembed(db, moviePages = 3, tvPages = 2) {
  const FREMBED = 'https://frembed.casa/api/public/v1'
  let total = 0

  for (let page = 1; page <= moviePages; page++) {
    try {
      const res  = await fetch(`${FREMBED}/movies?page=${page}`)
      const data = await res.json()
      const seen = new Set()
      for (const item of data.result?.items ?? []) {
        if (!item.tmdb || seen.has(item.tmdb)) continue
        seen.add(item.tmdb)
        try {
          const r = await importFromTmdb(db, item.tmdb, 'movie')
          if (r.status === 'imported') total++
          await sleep(RATE_DELAY_MS)
        } catch (err) {
          console.error(`[frembed] movie/${item.tmdb}: ${err.message}`)
        }
      }
      console.log(`[frembed] films page ${page}/${moviePages} ✓`)
    } catch (err) {
      console.error(`[frembed] page movies/${page}: ${err.message}`)
    }
  }

  const seenTv = new Set()
  for (let page = 1; page <= tvPages; page++) {
    try {
      const res  = await fetch(`${FREMBED}/tv?page=${page}`)
      const data = await res.json()
      for (const item of data.result?.items ?? []) {
        if (!item.tmdb || seenTv.has(item.tmdb)) continue
        seenTv.add(item.tmdb)
        try {
          const r = await importFromTmdb(db, item.tmdb, 'tv')
          if (r.status === 'imported') total++
          await sleep(RATE_DELAY_MS)
        } catch (err) {
          console.error(`[frembed] tv/${item.tmdb}: ${err.message}`)
        }
      }
      console.log(`[frembed] séries page ${page}/${tvPages} ✓`)
    } catch (err) {
      console.error(`[frembed] page tv/${page}: ${err.message}`)
    }
  }

  return total
}

// ─── Import en masse Frembed SANS appels TMDB (enrichissement différé) ────────
// Insère titre + poster depuis Frembed instantanément.
// Lancer ensuite POST /api/enrich pour enrichir avec synopsis/genres/note.

// types: tableau de ['movie','tv'] ou sous-ensemble
export async function importFromFrembedBulk(db, types = ['movie', 'tv']) {
  const FREMBED = 'https://frembed.casa/api/public/v1'
  const BATCH   = 8

  const stmtCheck = db.prepare(
    'SELECT id FROM media WHERE (tmdb_id = ? AND media_type = ?) OR filepath = ?'
  )
  const stmtInsert = db.prepare(`
    INSERT OR IGNORE INTO media
      (filepath, titre_brut, titre_officiel, annee_devinee, poster_path,
       type, source, media_type, tmdb_id)
    VALUES
      (@filepath, @titre_brut, @titre_officiel, @annee_devinee, @poster_path,
       'stream', 'tmdb', @media_type, @tmdb_id)
  `)

  let total = 0
  const seen = new Set()

  async function fetchPage(endpoint, mediaType, page) {
    const res    = await fetch(`${FREMBED}/${endpoint}?page=${page}`, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data   = await res.json()
    const result = data.result ?? {}

    for (const item of result.items ?? []) {
      if (!item.tmdb) continue
      const key      = `${mediaType}:${item.tmdb}`
      const filepath = `tmdb://${mediaType}/${item.tmdb}`
      if (seen.has(key)) continue
      seen.add(key)
      if (stmtCheck.get(item.tmdb, mediaType, filepath)) continue

      stmtInsert.run({
        filepath,
        titre_brut:     item.title,
        titre_officiel: item.title,
        annee_devinee:  item.year  || null,
        poster_path:    extractPosterPath(item.poster),
        media_type:     mediaType,
        tmdb_id:        item.tmdb,
      })
      total++
    }

    return result.totalPages ?? 1
  }

  const ENDPOINTS = { movie: 'movies', tv: 'tv' }

  for (const mediaType of types) {
    const endpoint = ENDPOINTS[mediaType]
    let totalPages = 1
    try {
      totalPages = await fetchPage(endpoint, mediaType, 1)
    } catch (err) {
      console.error(`[frembed-bulk] page 1 ${endpoint}: ${err.message}`)
      continue
    }
    console.log(`[frembed-bulk] ${endpoint}: ${totalPages} pages...`)

    for (let page = 2; page <= totalPages; page += BATCH) {
      const size = Math.min(BATCH, totalPages - page + 1)
      await Promise.all(
        Array.from({ length: size }, (_, i) =>
          fetchPage(endpoint, mediaType, page + i).catch((err) =>
            console.error(`[frembed-bulk] page ${page + i} ${endpoint}: ${err.message}`)
          )
        )
      )
      await sleep(80)
      if (page % 160 === 2 || page + size > totalPages) {
        console.log(`[frembed-bulk] ${endpoint} ${Math.min(page + size - 1, totalPages)}/${totalPages} → ${total} nouveaux`)
      }
    }
  }

  console.log(`[frembed-bulk] Terminé : ${total} médias insérés`)
  return total
}

// ─── Scan contenu adulte via TMDB ─────────────────────────────────────────────

export async function scanAdultContent(db) {
  const TMDB_KEY = process.env.TMDB_API_KEY
  if (!TMDB_KEY) return

  const rows = db.prepare(
    `SELECT id, tmdb_id, media_type FROM media
     WHERE enriched_at IS NOT NULL AND is_adult IS NULL AND tmdb_id IS NOT NULL
     ORDER BY id`
  ).all()

  const stmtMark = db.prepare('UPDATE media SET is_adult = ? WHERE id = ?')
  let marked = 0
  const CONCURRENCY = 5

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY)
    await Promise.all(batch.map(async (row) => {
      try {
        const endpoint = row.media_type === 'tv' ? 'tv' : 'movie'
        const res  = await fetch(
          `https://api.themoviedb.org/3/${endpoint}/${row.tmdb_id}?api_key=${TMDB_KEY}&language=fr-FR`,
          { signal: AbortSignal.timeout(8000) }
        )
        if (!res.ok) return
        const data = await res.json()
        const isAdult = data.adult ? 1 : 0
        stmtMark.run(isAdult, row.id)
        if (isAdult) { marked++; console.log(`[adult-scan] ✗ ${data.title || data.name} (id=${row.id})`) }
      } catch {}
    }))
    await sleep(120)
    if ((i / CONCURRENCY) % 200 === 0) console.log(`[adult-scan] ${i}/${rows.length} vérifiés, ${marked} adultes trouvés`)
  }

  // Marquer le reste (non vérifié = 0) pour éviter re-scan
  db.prepare(`UPDATE media SET is_adult = 0 WHERE is_adult IS NULL`).run()
  console.log(`[adult-scan] Terminé — ${marked} contenus adultes masqués`)
}
