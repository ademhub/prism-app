import Database from 'better-sqlite3'
const db = new Database('movy.db')
const now = new Date().toISOString()

const recent = db.prepare(`
  SELECT titre_officiel, media_type, enriched_at
  FROM media
  WHERE enriched_at IS NOT NULL
  ORDER BY enriched_at DESC
  LIMIT 10
`).all()

const pending = db.prepare(`SELECT COUNT(*) as n FROM media WHERE enriched_at IS NULL`).get()
const tvPending = db.prepare(`SELECT COUNT(*) as n FROM media WHERE enriched_at IS NULL AND media_type='tv'`).get()
const moviePending = db.prepare(`SELECT COUNT(*) as n FROM media WHERE enriched_at IS NULL AND media_type='movie'`).get()

console.log('Heure actuelle:', now)
console.log('Total en attente:', pending.n)
console.log('TV en attente:', tvPending.n)
console.log('Films en attente:', moviePending.n)
console.log('\n10 derniers enrichis:')
recent.forEach(r => console.log(' ', r.media_type, r.enriched_at, r.titre_officiel?.slice(0,40)))
