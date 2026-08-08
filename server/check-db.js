import Database from 'better-sqlite3'
const db = new Database('movy.db')

const total    = db.prepare(`SELECT COUNT(*) as n FROM media`).get().n
const frembed  = db.prepare(`SELECT COUNT(*) as n FROM media WHERE filepath LIKE 'tmdb://%'`).get().n
const enriched = db.prepare(`SELECT COUNT(*) as n FROM media WHERE enriched_at IS NOT NULL`).get().n
const visible  = db.prepare(`SELECT COUNT(*) as n FROM media WHERE (enriched_at IS NOT NULL OR tmdb_id IS NOT NULL) AND (titre_officiel IS NOT NULL OR titre_brut IS NOT NULL)`).get().n
const movies   = db.prepare(`SELECT COUNT(*) as n FROM media WHERE filepath LIKE 'tmdb://movie/%'`).get().n
const tv       = db.prepare(`SELECT COUNT(*) as n FROM media WHERE filepath LIKE 'tmdb://tv/%'`).get().n
const noTitle  = db.prepare(`SELECT COUNT(*) as n FROM media WHERE filepath LIKE 'tmdb://%' AND titre_brut IS NULL AND titre_officiel IS NULL`).get().n

console.log(`Total BD        : ${total}`)
console.log(`Frembed total   : ${frembed}  (films: ${movies}, séries: ${tv})`)
console.log(`Enrichis TMDB   : ${enriched}`)
console.log(`Visibles API    : ${visible}`)
console.log(`Sans titre      : ${noTitle}`)
