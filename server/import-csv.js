import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'
import { initSchema } from './scan.js'
import { initTmdbSchema } from './tmdb.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ─── Load .env ────────────────────────────────────────────────────────────────
const envText = readFileSync(join(__dirname, '.env'), 'utf8')
for (const line of envText.split('\n')) {
  const eqIdx = line.indexOf('=')
  if (eqIdx > 0) {
    const key = line.slice(0, eqIdx).trim()
    const val = line.slice(eqIdx + 1).trim()
    if (key) process.env[key] = val
  }
}

const CSV_PATH = 'C:\\Users\\GT-INFO\\Downloads\\Films_Movix_Complet.csv'
const TMDB_BASE = 'https://api.themoviedb.org/3'
const WATCH_REGION = 'FR'
const CONCURRENT = 8
const BATCH_DELAY_MS = 600

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = []
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  let i = 0

  while (i < raw.length) {
    const fields = []
    let field = ''
    let inQuote = false

    while (i < raw.length) {
      const c = raw[i]

      if (inQuote) {
        if (c === '"') {
          if (raw[i + 1] === '"') {
            field += '"'
            i += 2
          } else {
            inQuote = false
            i++
          }
        } else {
          field += c
          i++
        }
      } else {
        if (c === '"') {
          inQuote = true
          i++
        } else if (c === ',') {
          fields.push(field)
          field = ''
          i++
        } else if (c === '\n') {
          i++
          break
        } else {
          field += c
          i++
        }
      }
    }

    fields.push(field)
    if (fields.length > 1 || fields[0].trim()) rows.push(fields)
  }

  return rows
}

// ─── TMDB ─────────────────────────────────────────────────────────────────────
async function tmdbGet(path) {
  const apiKey = process.env.TMDB_API_KEY
  const url = new URL(`${TMDB_BASE}${path}`)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('language', 'fr-FR')
  const res = await fetch(url)
  if (!res.ok) throw new Error(`TMDB HTTP ${res.status} sur ${path}`)
  return res.json()
}

async function enrichOne(db, row, stmts) {
  try {
    const [details, credits, watchData] = await Promise.all([
      tmdbGet(`/movie/${row.tmdb_id}`),
      tmdbGet(`/movie/${row.tmdb_id}/credits`),
      tmdbGet(`/movie/${row.tmdb_id}/watch/providers`),
    ])

    const cast = (credits.cast ?? []).slice(0, 5)
    const regionData = watchData.results?.[WATCH_REGION] ?? null
    const watch_providers = regionData ? JSON.stringify({
      flatrate: regionData.flatrate ?? [],
      rent:     regionData.rent     ?? [],
      buy:      regionData.buy      ?? [],
      link:     regionData.link     ?? null,
    }) : null

    db.transaction(() => {
      stmts.update.run({
        tmdb_id:       row.tmdb_id,
        poster_path:   details.poster_path   ?? null,
        backdrop_path: details.backdrop_path ?? null,
        duree:         details.runtime       ?? null,
        watch_providers,
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
  } catch (err) {
    console.error(`  [!] tmdb_id ${row.tmdb_id}: ${err.message}`)
    return false
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const db = new Database(join(__dirname, 'movy.db'))
initSchema(db)
initTmdbSchema(db)

// ── Phase 1 : import CSV ──────────────────────────────────────────────────────
console.log('[1/2] Lecture du CSV...')
const csvText = readFileSync(CSV_PATH, 'utf8')
const rows = parseCSV(csvText)
const header = rows[0]
const data = rows.slice(1)

// Colonnes : Titre,Année,Note,Genres,Synopsis,Provider,URL Movix,ID TMDB
const COL = {
  titre:    header.indexOf('Titre'),
  annee:    header.indexOf('Année'),
  note:     header.indexOf('Note'),
  genres:   header.indexOf('Genres'),
  synopsis: header.indexOf('Synopsis'),
  provider: header.indexOf('Provider'),
  tmdb_id:  header.indexOf('ID TMDB'),
}

const insert = db.prepare(`
  INSERT INTO media (filepath, titre_brut, titre_officiel, annee_devinee, note, genres, synopsis, source, tmdb_id, type, media_type, enriched_at)
  VALUES (@filepath, @titre_brut, @titre_officiel, @annee_devinee, @note, @genres, @synopsis, @source, @tmdb_id, @type, @media_type, @enriched_at)
  ON CONFLICT (filepath) DO NOTHING
`)

const importAll = db.transaction((rows) => {
  const now = new Date().toISOString()
  let inserted = 0
  for (const row of rows) {
    const tmdb_id = parseInt(row[COL.tmdb_id], 10)
    if (!tmdb_id || isNaN(tmdb_id)) continue

    const genres = (row[COL.genres] ?? '')
      .split('|')
      .map(g => g.trim())
      .filter(Boolean)

    const result = insert.run({
      filepath:      `movix://${tmdb_id}`,
      titre_brut:    row[COL.titre]    ?? '',
      titre_officiel:row[COL.titre]    ?? '',
      annee_devinee: parseInt(row[COL.annee], 10) || null,
      note:          parseFloat(row[COL.note])   || null,
      genres:        JSON.stringify(genres),
      synopsis:      row[COL.synopsis] ?? '',
      source:        row[COL.provider] ?? 'streaming',
      tmdb_id,
      type:          'stream',
      media_type:    'movie',
      enriched_at:   now,
    })
    if (result.changes > 0) inserted++
  }
  return inserted
})

const inserted = importAll(data)
console.log(`[1/2] ${inserted} films insérés (${data.length - inserted} déjà existants)\n`)

// ── Phase 2 : enrichissement TMDB (poster / backdrop / durée / cast) ──────────
console.log('[2/2] Enrichissement TMDB (posters, durée, casting)...')
console.log('      Appuyez sur Ctrl+C pour arrêter — les films sont déjà visibles.\n')

const needEnrich = db.prepare(`
  SELECT id, tmdb_id FROM media
  WHERE type = 'stream'
    AND tmdb_id IS NOT NULL
    AND poster_path IS NULL
`).all()

if (needEnrich.length === 0) {
  console.log('Tous les films ont déjà leurs visuels. Terminé.')
  process.exit(0)
}

console.log(`${needEnrich.length} films à enrichir...`)

const stmts = {
  update: db.prepare(`
    UPDATE media SET
      poster_path   = @poster_path,
      backdrop_path = @backdrop_path,
      duree         = @duree,
      watch_providers = @watch_providers
    WHERE tmdb_id = @tmdb_id
  `),
  deleteCast:  db.prepare(`DELETE FROM media_cast WHERE media_id = ?`),
  insertActor: db.prepare(`
    INSERT INTO media_cast (media_id, nom, photo_path, ordre)
    VALUES (@media_id, @nom, @photo_path, @ordre)
  `),
}

let done = 0, errors = 0

for (let i = 0; i < needEnrich.length; i += CONCURRENT) {
  const batch = needEnrich.slice(i, i + CONCURRENT)
  const results = await Promise.all(batch.map(row => enrichOne(db, row, stmts)))
  done    += results.filter(Boolean).length
  errors  += results.filter(v => !v).length
  await sleep(BATCH_DELAY_MS)

  const total = needEnrich.length
  const pct   = Math.round(((i + batch.length) / total) * 100)
  process.stdout.write(`\r  ${i + batch.length}/${total} (${pct}%)  OK: ${done}  Erreurs: ${errors}`)
}

console.log('\n\n[2/2] Terminé !')
console.log(`  Enrichis : ${done} | Erreurs : ${errors}`)
