import { readdirSync, statSync } from 'fs'
import { join, extname, basename } from 'path'

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi'])

// Patterns courants : "Title.Name.2023.1080p", "Title Name (2023)", "Title_Name_2019_HD"
const YEAR_RE = /\b(19\d{2}|20\d{2})\b/

function parseFilename(filepath) {
  const name = basename(filepath, extname(filepath))

  const match = name.match(YEAR_RE)
  const annee = match ? parseInt(match[1], 10) : null

  // Tout ce qui précède l'année (ou le nom entier si pas d'année)
  let raw = match ? name.slice(0, match.index) : name

  // Remplace les séparateurs courants et nettoie les bords
  const titre = raw
    .replace(/[._\-]+/g, ' ')
    .replace(/[[\]()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || name

  return { titre, annee }
}

function walkDir(dir) {
  const results = []

  function walk(current) {
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      return // dossier inaccessible, on ignore
    }

    for (const entry of entries) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath)
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (VIDEO_EXTENSIONS.has(ext)) {
          results.push({ filepath: fullPath, ext })
        }
      }
    }
  }

  walk(dir)
  return results
}

export function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS media (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      filepath      TEXT    UNIQUE NOT NULL,
      titre_brut    TEXT,
      annee_devinee INTEGER,
      type          TEXT,
      source        TEXT    NOT NULL DEFAULT 'local',
      tmdb_id       INTEGER,
      titre_officiel TEXT,
      synopsis      TEXT,
      poster_path   TEXT,
      backdrop_path TEXT,
      note          REAL,
      genres        TEXT,
      duree         INTEGER,
      enriched_at   TEXT,
      media_type    TEXT,
      watch_providers TEXT,
      collection_id INTEGER,
      collection_name TEXT,
      saisons       TEXT,
      is_adult      INTEGER DEFAULT 0
    )
  `)
}

export function runScan(db) {
  const mediaPath = process.env.MEDIA_PATH
  if (!mediaPath) throw new Error('MEDIA_PATH non défini')

  const files = walkDir(mediaPath)

  const insert = db.prepare(`
    INSERT INTO media (filepath, titre_brut, annee_devinee, type)
    VALUES (@filepath, @titre_brut, @annee_devinee, @type)
    ON CONFLICT (filepath) DO UPDATE SET
      titre_brut    = excluded.titre_brut,
      annee_devinee = excluded.annee_devinee,
      type          = excluded.type
  `)

  const insertAll = db.transaction((rows) => {
    for (const { filepath, ext } of rows) {
      const { titre, annee } = parseFilename(filepath)
      insert.run({
        filepath,
        titre_brut: titre,
        annee_devinee: annee,
        type: ext.slice(1), // 'mp4' | 'mkv' | 'avi'
      })
    }
  })

  insertAll(files)
  return files.length
}
