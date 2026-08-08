import Database from 'better-sqlite3'
import { initSchema } from './scan.js'
import { initTmdbSchema, importFromFrembedBulk } from './tmdb.js'

const db = new Database('movy.db')
db.pragma('journal_mode = WAL')
db.pragma('cache_size = -32000')
initSchema(db)
initTmdbSchema(db)

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_media_tmdb_id ON media(tmdb_id);
  CREATE INDEX IF NOT EXISTS idx_media_type    ON media(media_type);
`)

const { n: before } = db.prepare(`SELECT COUNT(*) as n FROM media WHERE filepath LIKE 'tmdb://%'`).get()
console.log(`\n Catalogue actuel : ${before} médias Frembed`)
console.log(` Import de tous les films et séries Frembed...\n`)

importFromFrembedBulk(db)
  .then((inserted) => {
    const { n: after } = db.prepare(`SELECT COUNT(*) as n FROM media WHERE filepath LIKE 'tmdb://%'`).get()
    console.log(`\n Terminé : ${inserted} nouveaux insérés, total catalogue = ${after} médias`)
    console.log(` Redémarre le serveur pour lancer l'enrichissement TMDB (synopsis, notes, genres)\n`)
    process.exit(0)
  })
  .catch((err) => {
    console.error('\n Erreur :', err.message)
    process.exit(1)
  })
