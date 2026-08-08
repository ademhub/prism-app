import { statSync, createReadStream } from 'fs'
import { extname } from 'path'

const MIME = {
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
}

// Regex stricte : bytes=start-end  |  bytes=start-  |  bytes=-suffix
const RANGE_RE = /^bytes=(\d+)?-(\d+)?$/

function parseRange(header, fileSize) {
  const m = header.match(RANGE_RE)
  if (!m) return null

  const [, s, e] = m

  if (!s && !e) return null // "bytes=-" invalide

  let start, end

  if (!s) {
    // Suffix range : bytes=-N  → derniers N octets
    const suffix = parseInt(e, 10)
    start = Math.max(0, fileSize - suffix)
    end = fileSize - 1
  } else {
    start = parseInt(s, 10)
    end = e !== undefined ? parseInt(e, 10) : fileSize - 1
  }

  if (start > end || end >= fileSize || start < 0) return null

  return { start, end }
}

export function createStreamHandler(db) {
  const getMedia = db.prepare('SELECT filepath FROM media WHERE id = ?')

  return (req, res) => {
    const row = getMedia.get(req.params.id)
    if (!row) return res.status(404).json({ error: 'Media introuvable' })

    let stat
    try {
      stat = statSync(row.filepath)
    } catch {
      return res.status(404).json({ error: 'Fichier inaccessible sur le disque' })
    }

    const { size } = stat
    const mime = MIME[extname(row.filepath).toLowerCase()] ?? 'application/octet-stream'
    const rangeHeader = req.headers.range

    // ── Pas de Range → fichier complet 200 ─────────────────────────────────
    if (!rangeHeader) {
      res.writeHead(200, {
        'Content-Type':   mime,
        'Content-Length': size,
        'Accept-Ranges':  'bytes',
      })
      const s = createReadStream(row.filepath)
      req.on('close', () => s.destroy())
      s.pipe(res)
      return
    }

    // ── Range invalide → 416 Range Not Satisfiable ──────────────────────────
    const range = parseRange(rangeHeader, size)
    if (!range) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` })
      return res.end()
    }

    // ── Partial Content 206 ─────────────────────────────────────────────────
    const { start, end } = range
    res.writeHead(206, {
      'Content-Type':   mime,
      'Content-Range':  `bytes ${start}-${end}/${size}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': end - start + 1,
    })

    const s = createReadStream(row.filepath, { start, end })
    req.on('close', () => s.destroy()) // libère le fd si le client coupe
    s.pipe(res)
  }
}
