import Database from 'better-sqlite3'
const db = new Database('movy.db')
const tvEnriched = db.prepare(`SELECT COUNT(*) as n FROM media WHERE media_type = 'tv' AND enriched_at IS NOT NULL`).get().n
const tvPending  = db.prepare(`SELECT COUNT(*) as n FROM media WHERE media_type = 'tv' AND enriched_at IS NULL`).get().n
console.log('Séries enrichies (avec affiche TMDB):', tvEnriched)
console.log('Séries en attente enrichissement:', tvPending)

// Sample de séries sans affiche pour voir le format poster Frembed
const sample = db.prepare(`SELECT id, titre_brut, poster_path FROM media WHERE media_type = 'tv' AND poster_path IS NULL LIMIT 5`).all()
console.log('Exemples séries sans affiche:', sample)
