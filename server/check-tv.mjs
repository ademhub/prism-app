import Database from 'better-sqlite3'
const db = new Database('movy.db')
console.log('TV total:', db.prepare("SELECT COUNT(*) as n FROM media WHERE media_type='tv'").get().n)
console.log('TV non enrichies:', db.prepare("SELECT COUNT(*) as n FROM media WHERE media_type='tv' AND enriched_at IS NULL").get().n)
console.log('TV avec poster:', db.prepare("SELECT COUNT(*) as n FROM media WHERE media_type='tv' AND poster_path IS NOT NULL").get().n)
const sample = db.prepare("SELECT titre_officiel, titre_brut, poster_path, enriched_at FROM media WHERE media_type='tv' LIMIT 5").all()
console.log('Exemples:', sample)
