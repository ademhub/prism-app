import Database from 'better-sqlite3'
const db = new Database('movy.db')

// Vérifie F1 (Brad Pitt) et Project Hail Mary dans la base
const f1 = db.prepare(`SELECT id, titre_officiel, titre_brut, tmdb_id, poster_path FROM media WHERE tmdb_id = 1079091`).get()
console.log('F1 Brad Pitt (1079091):', f1)

const phm = db.prepare(`SELECT id, titre_officiel, titre_brut, tmdb_id, poster_path FROM media WHERE tmdb_id = 726209`).get()
console.log('tmdb:726209:', phm)

// Supprime l'import espagnol erroné
const del = db.prepare(`DELETE FROM media WHERE tmdb_id = 1294947`).run()
console.log('Supprimé tmdb:1294947:', del.changes)

// Cherche "F1" dans la base
const f1search = db.prepare(`SELECT id, titre_officiel, titre_brut, tmdb_id, annee_devinee FROM media WHERE titre_officiel LIKE 'F1%' OR titre_brut LIKE 'F1%' ORDER BY annee_devinee DESC LIMIT 5`).all()
console.log('Films F1 dans la base:', f1search)
