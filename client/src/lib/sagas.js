export const SAGA_PATTERNS = [
  { key: 'spider-man',   name: 'Spider-Man',    patterns: ['Spider-Man', 'Spider Man', 'Spiderman', 'Miles Morales', 'Spider-Verse'] },
  { key: 'avengers',     name: 'Avengers',      patterns: ['Avengers'] },
  { key: 'star-wars',    name: 'Star Wars',     patterns: ['Star Wars', 'Rogue One : ', 'Solo : A Star Wars'] },
  { key: 'fast',         name: 'Fast & Furious', patterns: ['Fast & Furious', 'Fast Five', 'Fast X', 'Furious 7', 'Furious 8', 'Furious 9', 'Fate of the Furious', 'Rapide et Dangereux', 'Hobbs & Shaw', 'F9'] },
  { key: 'harry-potter', name: 'Harry Potter',  patterns: ['Harry Potter', 'Animaux Fantastiques', 'Fantastic Beasts'] },
  { key: 'batman',       name: 'Batman',        patterns: ['Batman', 'Dark Knight'] },
  { key: 'deadpool',     name: 'Deadpool',      patterns: ['Deadpool'] },
  { key: 'superman',     name: 'Superman',      patterns: ['Superman', 'Man of Steel', "Homme d'Acier"] },
]

export function titleMatchesSaga(titre, patterns) {
  const t = titre.toLowerCase()
  return patterns.some((p) => {
    const pat = p.toLowerCase()
    if (t === pat) return true
    return (
      t.startsWith(pat + ' ') || t.startsWith(pat + ':') || t.startsWith(pat + ' :') ||
      t.includes(' ' + pat) || t.includes('-' + pat)
    )
  })
}

export function getSagaKey(titre) {
  for (const saga of SAGA_PATTERNS) {
    if (titleMatchesSaga(titre, saga.patterns)) return saga.key
  }
  return null
}

const KNOCKOFF_KEYWORDS = ['lego', 'grimm', 'mockbuster', 'parodie', 'kinopoisk']
const SAGA_EXCLUDED     = new Set(['Musique', 'Téléfilm'])

export function isKnockoff(titre) {
  const t = titre.toLowerCase()
  return KNOCKOFF_KEYWORDS.some((k) => t.includes(k))
}

export function detectSagas(list) {
  const eligible = list.filter((m) => {
    if (!m.poster_path || !(m.titre_officiel || m.titre_brut)) return false
    if (m.note > 0 && m.note < 4.0) return false
    if (isKnockoff(m.titre_officiel || m.titre_brut || '')) return false
    return !(m.genres ?? []).some((g) => SAGA_EXCLUDED.has(g))
  })

  const sagas = []
  for (const saga of SAGA_PATTERNS) {
    const matches = eligible.filter((m) =>
      titleMatchesSaga(m.titre_officiel || m.titre_brut || '', saga.patterns)
    )
    if (matches.length < 2) continue

    const deduped = [...new Map(matches.map((m) => [m.id, m])).values()]
    const sorted  = [...deduped].sort((a, b) => (b.annee_devinee ?? 0) - (a.annee_devinee ?? 0))
    const avgNote = sorted.reduce((s, m) => s + (m.note ?? 0), 0) / sorted.length
    const maxYear = sorted[0]?.annee_devinee ?? 0

    sagas.push({ key: saga.key, name: saga.name, movies: sorted, count: sorted.length, avgNote, maxYear })
  }

  return sagas.sort((a, b) => {
    const recentA = a.maxYear >= 2024 ? 1 : 0
    const recentB = b.maxYear >= 2024 ? 1 : 0
    if (recentB !== recentA) return recentB - recentA
    if (b.maxYear !== a.maxYear) return b.maxYear - a.maxYear
    return b.count * (b.avgNote || 5) - a.count * (a.avgNote || 5)
  })
}
