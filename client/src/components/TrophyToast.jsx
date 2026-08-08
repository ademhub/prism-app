import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function TrophyToast({ trophies, newIds }) {
  const [queue, setQueue] = useState([])
  const [current, setCurrent] = useState(null)

  useEffect(() => {
    if (!newIds?.length || !trophies?.length) return
    const toShow = newIds.map((id) => trophies.find((t) => t.id === id)).filter(Boolean)
    setQueue(toShow)
  }, [newIds?.join(',')])

  useEffect(() => {
    if (current || queue.length === 0) return
    const [next, ...rest] = queue
    setCurrent(next)
    setQueue(rest)
    const t = setTimeout(() => setCurrent(null), 3500)
    return () => clearTimeout(t)
  }, [queue, current])

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.id}
          initial={{ opacity: 0, y: 40, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 24 }}
          className="fixed bottom-28 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-surface/95 border border-accent/30 shadow-[0_8px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl"
        >
          <span className="text-3xl">{current.icon}</span>
          <div>
            <p className="text-[10px] text-accent font-semibold uppercase tracking-widest">Trophée débloqué !</p>
            <p className="text-warm font-semibold text-sm">{current.name}</p>
            <p className="text-warm/40 text-xs">{current.desc}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
