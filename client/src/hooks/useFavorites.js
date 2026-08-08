import { useCallback, useEffect, useState } from 'react'

const KEY = 'movy_favorites'

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? [] }
  catch { return [] }
}

export function useFavorites() {
  const [ids, setIds] = useState(load)

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(ids))
  }, [ids])

  const toggle = useCallback((id) => {
    setIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }, [])

  const isFav = useCallback((id) => ids.includes(id), [ids])

  return { ids, toggle, isFav }
}
