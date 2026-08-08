import Database from 'better-sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const db = new Database(join(__dirname, 'movy.db'))

const r = db.prepare(`UPDATE media SET media_type = 'movie' WHERE type = 'stream' AND (media_type IS NULL OR media_type = '')`).run()
console.log('media_type fixé sur', r.changes, 'films')
db.close()
