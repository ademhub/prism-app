const TMDB_BASE = 'https://api.themoviedb.org/3'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const SAGA_COLLECTION_IDS = [
  { key: 'spider-man',   collectionId: 531241 },
  { key: 'avengers',     collectionId: 86311  },
  { key: 'star-wars',    collectionId: 10     },
  { key: 'fast',         collectionId: 9485   },
  { key: 'harry-potter', collectionId: 1241   },
  { key: 'batman',       collectionId: 263    },
  { key: 'deadpool',     collectionId: 448150 },
  { key: 'superman',     collectionId: 131326 },
]

export function initCollectionsSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS collections (
      key           TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      logo_path     TEXT,
      backdrop_path TEXT,
      poster_path   TEXT,
      tmdb_id       INTEGER
    )
  `)
  // Migration si la colonne poster_path n'existe pas encore
  const cols = new Set(db.prepare('PRAGMA table_info(collections)').all().map((c) => c.name))
  if (!cols.has('poster_path')) {
    db.exec('ALTER TABLE collections ADD COLUMN poster_path TEXT')
  }
}

export function getCollections(db) {
  return db.prepare('SELECT key, name, logo_path, backdrop_path, poster_path, tmdb_id FROM collections').all()
}

export async function fetchAndStoreLogos(db) {
  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) { console.warn('[collections] TMDB_API_KEY manquant'); return }

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO collections (key, name, logo_path, backdrop_path, poster_path, tmdb_id)
    VALUES (@key, @name, @logo_path, @backdrop_path, @poster_path, @tmdb_id)
  `)

  for (const { key, collectionId } of SAGA_COLLECTION_IDS) {
    try {
      const [details, images] = await Promise.all([
        fetch(`${TMDB_BASE}/collection/${collectionId}?api_key=${apiKey}&language=fr-FR`).then((r) => r.json()),
        fetch(`${TMDB_BASE}/collection/${collectionId}/images?api_key=${apiKey}`).then((r) => r.json()),
      ])
      await sleep(300)

      const logos = images.logos ?? []
      const logo =
        logos.find((l) => l.iso_639_1 === 'en') ||
        logos.find((l) => !l.iso_639_1)          ||
        logos[0]                                  ||
        null

      stmt.run({
        key,
        name:          details.name          ?? key,
        logo_path:     logo?.file_path       ?? null,
        backdrop_path: details.backdrop_path ?? null,
        poster_path:   details.poster_path   ?? null,
        tmdb_id:       collectionId,
      })

      console.log(`[collections] ✓ ${key} → logo: ${logo?.file_path ?? 'aucun'}, poster: ${details.poster_path ?? 'aucun'}`)
    } catch (err) {
      console.error(`[collections] ✗ ${key}: ${err.message}`)
    }
  }

  console.log('[collections] Récupération terminée')
}
