import express from 'express'
import Database from 'better-sqlite3'
import { Readable } from 'stream'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
import { initSchema, runScan } from './scan.js'
import { initTmdbSchema, enrichAllMedia, importFromTmdb, searchAndImport, importPopular, importFromFrembed, importFromFrembedBulk, scanAdultContent } from './tmdb.js'
import { createStreamHandler } from './stream.js'
import { getStreamUrl } from './proxy.js'
import { getGroups, getChannelsByGroup, resolveLiveStream, prefetchFrance, iptvOrgFallback, preloadIptvOrg } from './channels.js'
import { initCollectionsSchema, getCollections, fetchAndStoreLogos } from './collections.js'
import { fetchTvSaisonsAndStore } from './tmdb.js'

const app = express()
const db = new Database('movy.db')
const PORT = process.env.PORT || 3001

db.pragma('journal_mode = WAL')
db.pragma('cache_size = -32000')

initSchema(db)
initTmdbSchema(db)
initCollectionsSchema(db)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_media_enriched ON media(enriched_at);
  CREATE INDEX IF NOT EXISTS idx_media_note     ON media(note DESC);
  CREATE INDEX IF NOT EXISTS idx_media_tmdb_id  ON media(tmdb_id);
  CREATE INDEX IF NOT EXISTS idx_media_type     ON media(media_type);
`)

// Supprime les doublons tmdb:// quand un fichier local avec le même tmdb_id existe
db.prepare(`
  DELETE FROM media
  WHERE tmdb_id IS NOT NULL
    AND filepath LIKE 'tmdb://%'
    AND tmdb_id IN (
      SELECT tmdb_id FROM media
      WHERE tmdb_id IS NOT NULL
        AND filepath NOT LIKE 'tmdb://%'
    )
`).run()

db.exec(`
  CREATE TABLE IF NOT EXISTS progress (
    media_id          INTEGER PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
    position_secondes REAL    NOT NULL DEFAULT 0,
    updated_at        TEXT    NOT NULL
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      TEXT NOT NULL,
    type         TEXT NOT NULL,
    from_user_id TEXT,
    meta         TEXT,
    read         INTEGER DEFAULT 0,
    created_at   INTEGER DEFAULT (unixepoch())
  )
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS user_trophies (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL,
    trophy_id   TEXT NOT NULL,
    unlocked_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(user_id, trophy_id)
  );
  CREATE INDEX IF NOT EXISTS idx_trophy_user ON user_trophies(user_id);
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id    TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    content      TEXT NOT NULL,
    created_at   INTEGER DEFAULT (unixepoch()),
    read_at      INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(sender_id, recipient_id);
  CREATE INDEX IF NOT EXISTS idx_msg_recv ON messages(recipient_id, created_at);
`)

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id           TEXT PRIMARY KEY,
    username     TEXT UNIQUE,
    display_name TEXT,
    avatar_url   TEXT,
    bio          TEXT,
    created_at   INTEGER DEFAULT (unixepoch())
  );
  CREATE TABLE IF NOT EXISTS friendships (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    requester_id TEXT NOT NULL,
    addressee_id TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    created_at   INTEGER DEFAULT (unixepoch()),
    UNIQUE(requester_id, addressee_id)
  );
  CREATE INDEX IF NOT EXISTS idx_friend_requester ON friendships(requester_id);
  CREATE INDEX IF NOT EXISTS idx_friend_addressee ON friendships(addressee_id);
`)

app.use(express.json())
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, 'uploads/avatars'),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg'
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`)
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true)
    else cb(new Error('Image uniquement'))
  },
})

// ─── Prepared statements ─────────────────────────────────────────────────────

const stmtList = db.prepare(`
  SELECT
    id, titre_officiel, titre_brut, poster_path, backdrop_path, note,
    genres, annee_devinee, duree, type, source, enriched_at, media_type, tmdb_id
  FROM media
  WHERE (enriched_at IS NOT NULL OR (tmdb_id IS NOT NULL AND poster_path IS NOT NULL))
    AND (titre_officiel IS NOT NULL OR titre_brut IS NOT NULL)
    AND (is_adult IS NULL OR is_adult = 0)
  ORDER BY note DESC NULLS LAST, id DESC
  LIMIT 50000
`)

const stmtSeries = db.prepare(`
  SELECT
    id, titre_officiel, titre_brut, poster_path, backdrop_path, note,
    genres, annee_devinee, duree, type, source, enriched_at, media_type, tmdb_id
  FROM media
  WHERE media_type = 'tv'
    AND poster_path IS NOT NULL
    AND (titre_officiel IS NOT NULL OR titre_brut IS NOT NULL)
    AND (is_adult IS NULL OR is_adult = 0)
  ORDER BY note DESC NULLS LAST, annee_devinee DESC NULLS LAST
`)

const stmtOne = db.prepare(`
  SELECT
    m.id, m.titre_officiel, m.titre_brut, m.synopsis,
    m.poster_path, m.backdrop_path, m.note, m.genres,
    m.duree, m.annee_devinee, m.type, m.tmdb_id, m.enriched_at,
    m.source, m.media_type, m.watch_providers, m.saisons,
    p.position_secondes
  FROM media m
  LEFT JOIN progress p ON p.media_id = m.id
  WHERE m.id = ?
`)

const stmtCast = db.prepare(`
  SELECT nom, photo_path
  FROM media_cast
  WHERE media_id = ?
  ORDER BY ordre ASC
`)

const stmtProgressList = db.prepare(`
  SELECT
    p.media_id     AS id,
    p.media_id,
    p.position_secondes,
    p.updated_at,
    m.titre_officiel, m.titre_brut,
    m.poster_path, m.backdrop_path,
    m.duree, m.note, m.genres, m.type
  FROM progress p
  JOIN media m ON m.id = p.media_id
  WHERE p.position_secondes > 30
  ORDER BY p.updated_at DESC
`)

const stmtUpsertProgress = db.prepare(`
  INSERT INTO progress (media_id, position_secondes, updated_at)
  VALUES (@media_id, @position_secondes, @updated_at)
  ON CONFLICT (media_id) DO UPDATE SET
    position_secondes = excluded.position_secondes,
    updated_at        = excluded.updated_at
`)

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.get('/api/scan', (_req, res) => {
  try {
    const count = runScan(db)
    res.json({ scanned: count })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/media', (_req, res) => {
  const rows = stmtList.all()
  res.json(rows.map((r) => ({ ...r, genres: r.genres ? JSON.parse(r.genres) : [] })))
})

app.get('/api/series', (_req, res) => {
  const rows = stmtSeries.all()
  res.json(rows.map((r) => ({ ...r, genres: r.genres ? JSON.parse(r.genres) : [] })))
})

app.get('/api/media/:id', async (req, res) => {
  const row = stmtOne.get(req.params.id)
  if (!row) return res.status(404).json({ error: 'Media introuvable' })

  let saisons = row.saisons ? JSON.parse(row.saisons) : null

  // Charge les saisons à la demande si c'est une série sans saisons encore
  if (!saisons && row.media_type === 'tv' && row.tmdb_id) {
    try {
      const details = await fetch(
        `https://api.themoviedb.org/3/tv/${row.tmdb_id}?api_key=${process.env.TMDB_API_KEY}&language=fr-FR`
      ).then((r) => r.json())
      const nb = details.number_of_seasons ?? 0
      if (nb > 0) {
        saisons = await fetchTvSaisonsAndStore(db, row.id, row.tmdb_id, nb)
      }
    } catch (err) {
      console.error(`[saisons] tmdb:${row.tmdb_id}: ${err.message}`)
    }
  }

  res.json({
    ...row,
    genres:          row.genres          ? JSON.parse(row.genres)          : [],
    watch_providers: row.watch_providers ? JSON.parse(row.watch_providers) : null,
    saisons,
    cast:            stmtCast.all(row.id),
  })
})

app.get('/api/stream/:id', createStreamHandler(db))

app.get('/api/progress', (_req, res) => {
  const rows = stmtProgressList.all()
  res.json(rows.map((r) => ({ ...r, genres: r.genres ? JSON.parse(r.genres) : [] })))
})

app.post('/api/progress', (req, res) => {
  const { media_id, position_secondes } = req.body ?? {}
  if (!Number.isInteger(media_id) || typeof position_secondes !== 'number') {
    return res.status(400).json({ error: 'media_id (entier) et position_secondes (nombre) requis' })
  }
  stmtUpsertProgress.run({ media_id, position_secondes, updated_at: new Date().toISOString() })
  res.json({ ok: true })
})

app.post('/api/enrich', (_req, res) => {
  if (app.locals.enriching) {
    return res.status(409).json({ error: 'Enrichissement déjà en cours' })
  }
  app.locals.enriching = true
  res.status(202).json({ message: 'Enrichissement démarré' })
  enrichAllMedia(db)
    .then((result) => console.log('[enrich] Terminé :', result))
    .catch((err) => console.error('[enrich] Erreur globale :', err.message))
    .finally(() => { app.locals.enriching = false })
})

// ─── Acteur ───────────────────────────────────────────────────────────────────

const stmtActorFilms = db.prepare(`
  SELECT
    m.id, m.titre_officiel, m.titre_brut, m.poster_path, m.backdrop_path,
    m.note, m.annee_devinee, m.genres, m.duree, m.type,
    mc.photo_path AS actor_photo
  FROM media_cast mc
  JOIN media m ON m.id = mc.media_id
  WHERE mc.nom = ?
  ORDER BY m.note DESC NULLS LAST
`)

app.get('/api/actor/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name)
  const rows = stmtActorFilms.all(name)
  if (!rows.length) return res.status(404).json({ error: 'Acteur introuvable' })
  res.json({
    name,
    photo_path: rows[0].actor_photo ?? null,
    films: rows.map((r) => ({ ...r, genres: r.genres ? JSON.parse(r.genres) : [], actor_photo: undefined })),
  })
})

// ─── Trailer TMDB ────────────────────────────────────────────────────────────

const stmtTmdbId = db.prepare('SELECT tmdb_id FROM media WHERE id = ?')

app.get('/api/trailer/:id', async (req, res) => {
  const row = stmtTmdbId.get(req.params.id)
  if (!row?.tmdb_id) return res.status(404).json({ error: 'Film introuvable' })

  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'TMDB_API_KEY manquant' })

  try {
    const url = `https://api.themoviedb.org/3/movie/${row.tmdb_id}/videos?api_key=${apiKey}&language=fr-FR`
    const data = await fetch(url).then((r) => r.json())
    const videos = data.results ?? []

    // Préfère la bande-annonce officielle en français, sinon en anglais
    const pick =
      videos.find((v) => v.type === 'Trailer' && v.site === 'YouTube' && v.iso_639_1 === 'fr') ||
      videos.find((v) => v.type === 'Trailer' && v.site === 'YouTube') ||
      videos.find((v) => v.site === 'YouTube')

    if (!pick) return res.status(404).json({ error: 'Aucune bande-annonce disponible' })
    res.json({ key: pick.key, name: pick.name })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Import TMDB ─────────────────────────────────────────────────────────────

app.post('/api/import', async (req, res) => {
  const { tmdbId, mediaType, query } = req.body ?? {}
  try {
    let result
    if (query) {
      result = await searchAndImport(db, query, mediaType ?? 'movie')
    } else if (tmdbId) {
      result = await importFromTmdb(db, Number(tmdbId), mediaType ?? 'movie')
    } else {
      return res.status(400).json({ error: 'tmdbId ou query requis' })
    }
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/import/popular', async (req, res) => {
  if (app.locals.importing) return res.status(409).json({ error: 'Import déjà en cours' })
  const pages = Number(req.body?.pages ?? 1)
  app.locals.importing = true
  res.status(202).json({ message: `Import populaire démarré (${pages} page(s))` })
  importPopular(db, pages)
    .then((n) => console.log(`[import] ${n} médias importés`))
    .catch((err) => console.error('[import] erreur:', err.message))
    .finally(() => { app.locals.importing = false })
})

app.post('/api/import/frembed', async (req, res) => {
  if (app.locals.importing) return res.status(409).json({ error: 'Import déjà en cours' })
  const moviePages = Number(req.body?.moviePages ?? 3)
  const tvPages    = Number(req.body?.tvPages    ?? 2)
  app.locals.importing = true
  res.status(202).json({ message: `Import Frembed démarré (${moviePages} pages films, ${tvPages} pages séries)` })
  importFromFrembed(db, moviePages, tvPages)
    .then((n) => console.log(`[frembed] ${n} médias importés`))
    .catch((err) => console.error('[frembed] erreur:', err.message))
    .finally(() => { app.locals.importing = false })
})

// Import en masse depuis Frembed (rapide, sans TMDB par item)
// Puis POST /api/enrich pour enrichir avec synopsis/genres/note
app.post('/api/import/frembed/bulk', async (req, res) => {
  if (app.locals.importing) return res.status(409).json({ error: 'Import déjà en cours' })
  app.locals.importing = true
  res.status(202).json({ message: 'Import en masse Frembed démarré (tous les films + séries)' })
  importFromFrembedBulk(db)
    .then((n) => {
      console.log(`[frembed-bulk] ${n} médias insérés, démarrage enrichissement TMDB...`)
      return enrichAllMedia(db)
    })
    .then((r) => console.log('[enrich] Terminé :', r))
    .catch((err) => console.error('[frembed-bulk] erreur:', err.message))
    .finally(() => { app.locals.importing = false })
})

// Import séries uniquement
app.post('/api/import/frembed/series', async (req, res) => {
  if (app.locals.importing) return res.status(409).json({ error: 'Import déjà en cours' })
  app.locals.importing = true
  res.status(202).json({ message: 'Import séries Frembed démarré' })
  importFromFrembedBulk(db, ['tv'])
    .then((n) => {
      console.log(`[frembed-tv] ${n} séries insérées, enrichissement TMDB...`)
      return enrichAllMedia(db)
    })
    .then((r) => console.log('[enrich-tv] Terminé :', r))
    .catch((err) => console.error('[frembed-tv] erreur:', err.message))
    .finally(() => { app.locals.importing = false })
})

// ─── Collections (logos saga) ─────────────────────────────────────────────────

app.get('/api/collections', (_req, res) => {
  res.json(getCollections(db))
})

app.post('/api/collections/refresh', (_req, res) => {
  res.status(202).json({ message: 'Récupération des logos démarrée' })
  fetchAndStoreLogos(db).catch((err) => console.error('[collections]', err.message))
})

// ─── Stream URL ───────────────────────────────────────────────────────────────

const stmtStreamMeta = db.prepare('SELECT tmdb_id, media_type FROM media WHERE id = ?')

app.get('/api/stream-url/:id', async (req, res) => {
  const row = stmtStreamMeta.get(req.params.id)
  if (!row?.tmdb_id) return res.status(404).json({ error: 'Film introuvable' })

  const season    = req.query.season    ? Number(req.query.season)    : null
  const episode   = req.query.episode   ? Number(req.query.episode)   : null
  const sourceIdx = req.query.sourceIdx ? Number(req.query.sourceIdx) : 0

  try {
    const result = await getStreamUrl(row.tmdb_id, row.media_type ?? 'movie', season, episode, sourceIdx)
    if (!result) return res.status(404).json({ error: 'Stream introuvable' })

    if (result.type === 'hls') {
      const proxied = `/api/hls-proxy?url=${encodeURIComponent(result.url)}`
      return res.json({ url: proxied, type: 'hls' })
    }

    res.json({ url: result.url, type: 'embed' })
  } catch (err) {
    console.error('[stream-url]', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ─── Chaînes TV ──────────────────────────────────────────────────────────────

app.get('/api/channels/countries', async (_req, res) => {
  try {
    res.json(await getGroups())
  } catch (err) {
    res.status(502).json({ error: `Impossible de charger les groupes : ${err.message}` })
  }
})

app.get('/api/channels', async (req, res) => {
  const group = req.query.country ?? ''
  if (!group) return res.status(400).json({ error: 'Paramètre country manquant' })
  try {
    res.json(await getChannelsByGroup(group))
  } catch (err) {
    res.status(502).json({ error: `Impossible de charger les chaînes : ${err.message}` })
  }
})

const _resolveCache = new Map()
const RESOLVE_TTL   = 4 * 60 * 1000  // 4 min (tokens vavoo expirent vite)

app.get('/api/live-resolve', async (req, res) => {
  const { url, name, source } = req.query
  if (!url) return res.status(400).json({ error: 'url manquant' })

  // Source alternative forcée → iptv-org direct
  if (source === 'alt' && name) {
    const alt = await iptvOrgFallback(name).catch(() => null)
    if (alt) return res.json({ stream: alt })
    return res.status(404).json({ error: 'Aucune source alternative disponible' })
  }

  const cached = _resolveCache.get(url)
  if (cached && Date.now() - cached.at < RESOLVE_TTL) {
    return res.json({ stream: cached.stream })
  }

  try {
    const stream = await resolveLiveStream(url)
    _resolveCache.set(url, { stream, at: Date.now() })
    res.json({ stream })
  } catch (err) {
    // Frembed KO → essai iptv-org automatique
    if (name) {
      const alt = await iptvOrgFallback(name).catch(() => null)
      if (alt) {
        _resolveCache.set(url, { stream: alt, at: Date.now() })
        return res.json({ stream: alt })
      }
    }
    res.status(502).json({ error: err.message })
  }
})

// ─── HLS Proxy (réécriture m3u8 + segments) ──────────────────────────────────

app.get('/api/hls-proxy', async (req, res) => {
  const { url } = req.query
  if (!url || (!url.startsWith('https://') && !url.startsWith('http://'))) return res.status(400).end()

  try {
    const ctrl  = new AbortController()
    req.on('close', () => ctrl.abort())

    const origin  = (() => { try { return new URL(url).origin } catch { return '' } })()
    const isVavoo = url.includes('vavoo')
    const upstream = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        'User-Agent': isVavoo
          ? 'VYPN/1.0 (Android)'
          : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':     '*/*',
        'Connection': 'keep-alive',
        'Referer':    isVavoo ? 'https://vavoo.to/' : origin + '/',
        'Origin':     isVavoo ? 'https://vavoo.to'  : origin,
      },
    })

    if (!upstream.ok) {
      console.warn(`[hls-proxy] ${upstream.status} pour ${url.slice(0, 80)}`)
      return res.status(upstream.status).end()
    }

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'no-store')

    const isPlaylist = url.includes('.m3u8') ||
      (upstream.headers.get('Content-Type') ?? '').includes('mpegurl')

    if (isPlaylist) {
      const text    = await upstream.text()
      const baseUrl = url.slice(0, url.lastIndexOf('/') + 1)

      const rewritten = text.split('\n').map((line) => {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) return line
        // Ignore les lignes qui ressemblent à des attributs URI dans les tags
        if (trimmed.includes('URI="')) return line
        const abs = trimmed.startsWith('http') ? trimmed : baseUrl + trimmed
        return `/api/hls-proxy?url=${encodeURIComponent(abs)}`
      }).join('\n')

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
      return res.send(rewritten)
    }

    // Segments TS / AAC / etc. — stream direct sans bufferiser
    const ct = upstream.headers.get('Content-Type') || 'video/mp2t'
    res.setHeader('Content-Type', ct)
    if (upstream.headers.get('Content-Length')) {
      res.setHeader('Content-Length', upstream.headers.get('Content-Length'))
    }

    if (upstream.body) {
      const readable = Readable.fromWeb(upstream.body)
      readable.on('error', () => { if (!res.headersSent) res.destroy() })
      readable.pipe(res)
    } else {
      const buf = await upstream.arrayBuffer()
      res.send(Buffer.from(buf))
    }
  } catch (err) {
    if (err.name !== 'AbortError') console.error('[hls-proxy]', err.message)
    if (!res.headersSent) res.status(502).end()
  }
})

// ─── Social — Profils & Amis ─────────────────────────────────────────────────

// Créer / mettre à jour son profil
app.put('/api/users/me', (req, res) => {
  const { userId, username, display_name, bio, avatar_url } = req.body
  if (!userId) return res.status(400).json({ error: 'userId requis' })
  if (username) {
    const conflict = db.prepare(`SELECT id FROM profiles WHERE username = ? AND id != ?`).get(username, userId)
    if (conflict) return res.status(409).json({ error: 'Nom d\'utilisateur déjà pris' })
  }
  db.prepare(`
    INSERT INTO profiles (id, username, display_name, bio, avatar_url)
    VALUES (@userId, @username, @display_name, @bio, @avatar_url)
    ON CONFLICT(id) DO UPDATE SET
      username     = COALESCE(@username, username),
      display_name = COALESCE(@display_name, display_name),
      bio          = COALESCE(@bio, bio),
      avatar_url   = COALESCE(@avatar_url, avatar_url)
  `).run({ userId, username: username || null, display_name: display_name || null, bio: bio || null, avatar_url: avatar_url || null })
  res.json(db.prepare('SELECT * FROM profiles WHERE id = ?').get(userId))
})

// Mon profil
app.get('/api/users/me', (req, res) => {
  const { userId } = req.query
  if (!userId) return res.status(400).json({ error: 'userId requis' })
  const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(userId)
  res.json(profile ?? { id: userId })
})

// Rechercher des utilisateurs
app.get('/api/users/search', (req, res) => {
  const { q, userId } = req.query
  if (!q || q.trim().length < 2) return res.json([])
  const like = `%${q.trim()}%`
  const rows = db.prepare(`
    SELECT id, username, display_name, avatar_url, bio FROM profiles
    WHERE (username LIKE ? OR display_name LIKE ?) AND id != ?
    LIMIT 20
  `).all(like, like, userId ?? '')
  res.json(rows)
})

// Profil public d'un utilisateur
app.get('/api/users/:id', (req, res) => {
  const profile = db.prepare('SELECT id, username, display_name, avatar_url, bio FROM profiles WHERE id = ?').get(req.params.id)
  if (!profile) return res.status(404).json({ error: 'Profil introuvable' })
  res.json(profile)
})

// Envoyer une demande d'ami
app.post('/api/friends/request', (req, res) => {
  const { from, to } = req.body
  if (!from || !to || from === to) return res.status(400).json({ error: 'Paramètres invalides' })
  const existing = db.prepare(`
    SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
  `).get(from, to, to, from)
  if (existing) return res.status(409).json({ error: 'Demande déjà existante', status: existing.status })
  db.prepare(`INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'pending')`).run(from, to)
  db.prepare(`INSERT INTO notifications (user_id, type, from_user_id) VALUES (?, 'friend_request', ?)`).run(to, from)
  res.json({ ok: true })
})

// Accepter une demande
app.post('/api/friends/:id/accept', (req, res) => {
  const { userId } = req.body
  const f = db.prepare('SELECT * FROM friendships WHERE id = ?').get(req.params.id)
  if (!f || f.addressee_id !== userId) return res.status(403).json({ error: 'Non autorisé' })
  db.prepare(`UPDATE friendships SET status = 'accepted' WHERE id = ?`).run(f.id)
  res.json({ ok: true })
})

// Refuser / supprimer une relation
app.delete('/api/friends/:id', (req, res) => {
  const { userId } = req.body
  const f = db.prepare('SELECT * FROM friendships WHERE id = ?').get(req.params.id)
  if (!f || (f.requester_id !== userId && f.addressee_id !== userId)) return res.status(403).json({ error: 'Non autorisé' })
  db.prepare('DELETE FROM friendships WHERE id = ?').run(f.id)
  res.json({ ok: true })
})

// Liste d'amis (acceptés)
app.get('/api/friends', (req, res) => {
  const { userId } = req.query
  if (!userId) return res.status(400).json({ error: 'userId requis' })
  const rows = db.prepare(`
    SELECT f.id as friendship_id, f.created_at,
           p.id, p.username, p.display_name, p.avatar_url, p.bio
    FROM friendships f
    JOIN profiles p ON (
      CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END = p.id
    )
    WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
    ORDER BY f.created_at DESC
  `).all(userId, userId, userId)
  res.json(rows)
})

// Demandes reçues en attente
app.get('/api/friends/requests', (req, res) => {
  const { userId } = req.query
  if (!userId) return res.status(400).json({ error: 'userId requis' })
  const rows = db.prepare(`
    SELECT f.id as friendship_id, f.created_at,
           p.id, p.username, p.display_name, p.avatar_url
    FROM friendships f
    JOIN profiles p ON f.requester_id = p.id
    WHERE f.addressee_id = ? AND f.status = 'pending'
    ORDER BY f.created_at DESC
  `).all(userId)
  res.json(rows)
})

// ─── Trophées ────────────────────────────────────────────────────────────────

const TROPHIES = [
  // Visionnage
  { id: 'first_watch',   name: 'Premier film',        desc: 'Lance un film pour la première fois',       icon: '🎬', category: 'Visionnage', secret: false },
  { id: 'watch_10',      name: 'Cinéphile',            desc: 'Regarde 10 films',                          icon: '🎥', category: 'Visionnage', secret: false },
  { id: 'watch_50',      name: 'Amateur de cinéma',    desc: 'Regarde 50 films',                          icon: '🎞️', category: 'Visionnage', secret: false },
  { id: 'watch_100',     name: 'Critique',             desc: 'Regarde 100 films',                         icon: '🏆', category: 'Visionnage', secret: false },
  { id: 'finish_1',      name: "Jusqu'au bout",        desc: 'Termine un film à plus de 85%',             icon: '✅', category: 'Visionnage', secret: false },
  { id: 'finish_10',     name: 'Persévérant',          desc: 'Termine 10 films',                          icon: '⭐', category: 'Visionnage', secret: false },
  { id: 'finish_50',     name: 'Marathonien',          desc: 'Termine 50 films',                          icon: '🚀', category: 'Visionnage', secret: false },
  { id: 'watch_1h',      name: '1 heure regardée',     desc: 'Accumule 1 heure de visionnage',            icon: '⏱️', category: 'Visionnage', secret: false },
  { id: 'watch_10h',     name: '10 heures regardées',  desc: 'Accumule 10 heures de visionnage',          icon: '⌚', category: 'Visionnage', secret: false },
  { id: 'watch_100h',    name: 'Canapé addict',        desc: 'Accumule 100 heures de visionnage',         icon: '🛋️', category: 'Visionnage', secret: true  },
  { id: 'night_owl',     name: 'Noctambule',           desc: 'Regarde quelque chose après minuit',        icon: '🦉', category: 'Visionnage', secret: true  },
  // Exploration
  { id: 'genres_5',      name: 'Éclectique',           desc: 'Regarde des films de 5 genres différents',  icon: '🎭', category: 'Exploration', secret: false },
  { id: 'genres_10',     name: 'Omnivore',             desc: 'Regarde des films de 10 genres différents', icon: '🌈', category: 'Exploration', secret: false },
  // Social
  { id: 'first_friend',  name: 'Premier ami',          desc: 'Ajoute ton premier ami',                    icon: '👋', category: 'Social', secret: false },
  { id: 'friends_5',     name: 'Populaire',            desc: 'Atteins 5 amis',                            icon: '👥', category: 'Social', secret: false },
  { id: 'first_message', name: 'Premier message',      desc: 'Envoie ton premier message',                icon: '💬', category: 'Social', secret: false },
  { id: 'profile_done',  name: 'Identité',             desc: 'Complète ton profil (nom + bio + photo)',   icon: '🪪', category: 'Social', secret: false },
]

function checkAndAwardTrophies(userId) {
  const already = new Set(
    db.prepare('SELECT trophy_id FROM user_trophies WHERE user_id = ?').all(userId).map((r) => r.trophy_id)
  )
  const newOnes = []

  const award = (id) => {
    if (already.has(id)) return
    try {
      db.prepare('INSERT INTO user_trophies (user_id, trophy_id) VALUES (?, ?)').run(userId, id)
      newOnes.push(id)
    } catch {}
  }

  // Données de progression (partagées sur le serveur)
  const progress = db.prepare(`
    SELECT p.position_secondes, p.updated_at, m.duree, m.genres
    FROM progress p JOIN media m ON p.media_id = m.id
    WHERE p.position_secondes > 60
  `).all()

  const watched = progress.length
  const finished = progress.filter((p) => p.duree && (p.position_secondes / (p.duree * 60)) > 0.85).length
  const totalSeconds = progress.reduce((s, p) => s + (p.position_secondes ?? 0), 0)
  const totalHours = totalSeconds / 3600

  // Genres uniques regardés
  const genreSet = new Set()
  for (const p of progress) {
    if (p.genres) { try { JSON.parse(p.genres).forEach((g) => genreSet.add(g)) } catch {} }
  }

  // Noctambule — regardé entre minuit et 5h
  const nightWatch = progress.some((p) => {
    if (!p.updated_at) return false
    const h = new Date(p.updated_at).getHours()
    return h >= 0 && h < 5
  })

  if (watched >= 1)   award('first_watch')
  if (watched >= 10)  award('watch_10')
  if (watched >= 50)  award('watch_50')
  if (watched >= 100) award('watch_100')
  if (finished >= 1)  award('finish_1')
  if (finished >= 10) award('finish_10')
  if (finished >= 50) award('finish_50')
  if (totalHours >= 1)   award('watch_1h')
  if (totalHours >= 10)  award('watch_10h')
  if (totalHours >= 100) award('watch_100h')
  if (nightWatch)        award('night_owl')
  if (genreSet.size >= 5)  award('genres_5')
  if (genreSet.size >= 10) award('genres_10')

  // Social
  const friendCount = db.prepare(`
    SELECT COUNT(*) as n FROM friendships
    WHERE (requester_id = ? OR addressee_id = ?) AND status = 'accepted'
  `).get(userId, userId)?.n ?? 0
  if (friendCount >= 1) award('first_friend')
  if (friendCount >= 5) award('friends_5')

  const msgCount = db.prepare('SELECT COUNT(*) as n FROM messages WHERE sender_id = ?').get(userId)?.n ?? 0
  if (msgCount >= 1) award('first_message')

  const profile = db.prepare('SELECT * FROM profiles WHERE id = ?').get(userId)
  if (profile?.username && profile?.bio && profile?.avatar_url) award('profile_done')

  return newOnes
}

// Récupérer les trophées d'un utilisateur
app.get('/api/trophies', (req, res) => {
  const { userId } = req.query
  if (!userId) return res.status(400).json({ error: 'userId requis' })
  const unlocked = db.prepare('SELECT trophy_id, unlocked_at FROM user_trophies WHERE user_id = ?').all(userId)
  const unlockedMap = Object.fromEntries(unlocked.map((r) => [r.trophy_id, r.unlocked_at]))
  const result = TROPHIES.map((t) => ({
    ...t,
    unlocked: !!unlockedMap[t.id],
    unlocked_at: unlockedMap[t.id] ?? null,
  }))
  res.json(result)
})

// Vérifier et attribuer les nouveaux trophées
app.post('/api/trophies/check', (req, res) => {
  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId requis' })
  const newOnes = checkAndAwardTrophies(userId)
  res.json({ new: newOnes })
})

// ─── Messages ────────────────────────────────────────────────────────────────

// Récupérer une conversation entre deux utilisateurs
app.get('/api/messages', (req, res) => {
  const { userId, friendId, limit = 100 } = req.query
  if (!userId || !friendId) return res.status(400).json({ error: 'Paramètres manquants' })
  const rows = db.prepare(`
    SELECT * FROM messages
    WHERE (sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?)
    ORDER BY created_at ASC
    LIMIT ?
  `).all(userId, friendId, friendId, userId, Number(limit))
  // Marquer les messages reçus comme lus
  db.prepare(`
    UPDATE messages SET read_at = unixepoch()
    WHERE sender_id = ? AND recipient_id = ? AND read_at IS NULL
  `).run(friendId, userId)
  res.json(rows)
})

// Envoyer un message
app.post('/api/messages', (req, res) => {
  const { senderId, recipientId, content } = req.body
  if (!senderId || !recipientId || !content?.trim()) return res.status(400).json({ error: 'Paramètres manquants' })
  const result = db.prepare(`
    INSERT INTO messages (sender_id, recipient_id, content) VALUES (?, ?, ?)
  `).run(senderId, recipientId, content.trim())
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid)
  try {
    const parsed = JSON.parse(content.trim())
    if (parsed?.type === 'share') {
      db.prepare(`INSERT INTO notifications (user_id, type, from_user_id, meta) VALUES (?, 'share', ?, ?)`).run(recipientId, senderId, content.trim())
    }
  } catch {}
  res.json(msg)
})

// Supprimer un message (seulement l'expéditeur)
app.delete('/api/messages/:id', (req, res) => {
  const { userId } = req.body
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id)
  if (!msg) return res.status(404).json({ error: 'Message introuvable' })
  if (msg.sender_id !== userId) return res.status(403).json({ error: 'Non autorisé' })
  db.prepare('DELETE FROM messages WHERE id = ?').run(msg.id)
  res.json({ ok: true })
})

// Modifier un message (seulement l'expéditeur)
app.put('/api/messages/:id', (req, res) => {
  const { userId, content } = req.body
  if (!content?.trim()) return res.status(400).json({ error: 'Contenu requis' })
  const msg = db.prepare('SELECT * FROM messages WHERE id = ?').get(req.params.id)
  if (!msg) return res.status(404).json({ error: 'Message introuvable' })
  if (msg.sender_id !== userId) return res.status(403).json({ error: 'Non autorisé' })
  db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content.trim(), msg.id)
  const updated = db.prepare('SELECT * FROM messages WHERE id = ?').get(msg.id)
  res.json(updated)
})

// Derniers messages par conversation (pour la sidebar)
app.get('/api/messages/conversations', (req, res) => {
  const { userId } = req.query
  if (!userId) return res.status(400).json({ error: 'userId requis' })
  const rows = db.prepare(`
    SELECT m.*, p.username, p.display_name, p.avatar_url,
           (SELECT COUNT(*) FROM messages WHERE sender_id = p.id AND recipient_id = ? AND read_at IS NULL) as unread
    FROM messages m
    JOIN profiles p ON (
      CASE WHEN m.sender_id = ? THEN m.recipient_id ELSE m.sender_id END = p.id
    )
    WHERE (m.sender_id = ? OR m.recipient_id = ?)
      AND m.id = (
        SELECT id FROM messages m2
        WHERE (m2.sender_id = m.sender_id AND m2.recipient_id = m.recipient_id)
           OR (m2.sender_id = m.recipient_id AND m2.recipient_id = m.sender_id)
        ORDER BY created_at DESC LIMIT 1
      )
    GROUP BY CASE WHEN m.sender_id = ? THEN m.recipient_id ELSE m.sender_id END
    ORDER BY m.created_at DESC
  `).all(userId, userId, userId, userId, userId)
  res.json(rows)
})

// Upload avatar
app.post('/api/users/avatar', avatarUpload.single('avatar'), (req, res) => {
  const { userId } = req.body
  if (!userId || !req.file) return res.status(400).json({ error: 'Paramètres manquants' })
  const avatarUrl = `/uploads/avatars/${req.file.filename}`
  db.prepare(`
    INSERT INTO profiles (id, avatar_url) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET avatar_url = ?
  `).run(userId, avatarUrl, avatarUrl)
  res.json({ avatar_url: avatarUrl })
})

// Supprimer son compte (profil social + amitiés)
app.delete('/api/users/me', (req, res) => {
  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId requis' })
  // Supprime l'ancien avatar si existant
  const profile = db.prepare('SELECT avatar_url FROM profiles WHERE id = ?').get(userId)
  if (profile?.avatar_url?.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, profile.avatar_url)
    try { fs.unlinkSync(filePath) } catch {}
  }
  db.prepare('DELETE FROM friendships WHERE requester_id = ? OR addressee_id = ?').run(userId, userId)
  db.prepare('DELETE FROM profiles WHERE id = ?').run(userId)
  res.json({ ok: true })
})

// Statut d'amitié entre deux utilisateurs
app.get('/api/friends/status', (req, res) => {
  const { userId, otherId } = req.query
  if (!userId || !otherId) return res.status(400).json({ error: 'Paramètres manquants' })
  const f = db.prepare(`
    SELECT * FROM friendships
    WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)
  `).get(userId, otherId, otherId, userId)
  res.json(f ?? { status: 'none' })
})

// ─── Notifications ───────────────────────────────────────────────────────────

app.get('/api/notifications', (req, res) => {
  const { userId } = req.query
  if (!userId) return res.status(400).json({ error: 'userId requis' })
  const rows = db.prepare(`
    SELECT n.id, n.type, n.meta, n.read, n.created_at,
           p.id AS from_id, p.username, p.display_name, p.avatar_url
    FROM notifications n
    LEFT JOIN profiles p ON p.id = n.from_user_id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
    LIMIT 30
  `).all(userId)
  res.json(rows)
})

app.post('/api/notifications/read', (req, res) => {
  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'userId requis' })
  db.prepare(`UPDATE notifications SET read = 1 WHERE user_id = ?`).run(userId)
  res.json({ ok: true })
})

app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`)

  // Précharge les chaînes françaises + catalogue iptv-org en arrière-plan
  prefetchFrance().catch(() => {})
  preloadIptvOrg()

  if (!process.env.TMDB_API_KEY) return

  // Récupère les logos de collection si la table est vide
  const { n: collectionCount } = db.prepare('SELECT COUNT(*) as n FROM collections').get()
  if (collectionCount === 0) {
    console.log('[startup] Récupération des logos de saga...')
    fetchAndStoreLogos(db).catch((err) => console.error('[startup] collections:', err.message))
  }

  // Bulk import Frembed — check films et séries séparément
  const { n: movieCount } = db.prepare(
    `SELECT COUNT(*) as n FROM media WHERE filepath LIKE 'tmdb://movie/%'`
  ).get()
  const { n: tvCount } = db.prepare(
    `SELECT COUNT(*) as n FROM media WHERE filepath LIKE 'tmdb://tv/%'`
  ).get()

  const toImport = []
  if (movieCount < 40000) toImport.push('movie')
  if (tvCount    < 3000)  toImport.push('tv')

  if (toImport.length > 0) {
    console.log(`[startup] Import Frembed — films: ${movieCount}, séries: ${tvCount} → import: ${toImport.join(', ')}`)
    try {
      const inserted = await importFromFrembedBulk(db, toImport)
      console.log(`[startup] ${inserted} nouveaux médias insérés`)
    } catch (err) {
      console.error('[startup] Erreur bulk import:', err.message)
    }
    // Fallback TMDB si Frembed n'a rien retourné pour les séries
    if (toImport.includes('tv')) {
      const { n: newTvCount } = db.prepare(`SELECT COUNT(*) as n FROM media WHERE media_type = 'tv'`).get()
      if (newTvCount < 50) {
        console.log(`[startup] Frembed TV vide (${newTvCount}), fallback TMDB popular...`)
        importPopular(db, 3).catch((err) => console.error('[startup] fallback TMDB:', err.message))
      }
    }
  } else {
    console.log(`[startup] Catalogue OK — films: ${movieCount}, séries: ${tvCount}`)
  }

  // Enrichissement TMDB en arrière-plan pour tous les records sans métadonnées
  const { n: pending } = db.prepare(`SELECT COUNT(*) as n FROM media WHERE enriched_at IS NULL`).get()
  if (pending > 0) {
    console.log(`[startup] ${pending} médias à enrichir via TMDB (arrière-plan)...`)
    enrichAllMedia(db)
      .then((r) => console.log('[startup] Enrichissement terminé :', r))
      .catch((err) => console.error('[startup] Erreur enrichissement:', err.message))
  }

  // Scan adulte TMDB en arrière-plan pour les contenus déjà enrichis
  const { n: unscanned } = db.prepare(
    `SELECT COUNT(*) as n FROM media WHERE enriched_at IS NOT NULL AND is_adult IS NULL AND tmdb_id IS NOT NULL`
  ).get()
  if (unscanned > 0) {
    console.log(`[startup] Scan contenu adulte TMDB — ${unscanned} médias à vérifier...`)
    scanAdultContent(db).catch((err) => console.error('[startup] Scan adulte:', err.message))
  }
})
