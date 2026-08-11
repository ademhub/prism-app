import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import MediaCard from './MediaCard'

function useFadeIn() {
  const ref     = useRef(null)
  const [vis, setVis] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVis(true); obs.disconnect() } },
      { threshold: 0.06 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  return [ref, vis]
}

export default function MediaRow({ title, items, card: CardComponent }) {
  const Card = CardComponent ?? MediaCard
  const rowRef = useRef(null)
  const [secRef, visible] = useFadeIn()

  const scroll = (dir) =>
    rowRef.current?.scrollBy({ left: dir * 700, behavior: 'smooth' })

  return (
    <section
      ref={secRef}
      className="mb-12"
      style={{
        opacity:    visible ? 1 : 0,
        transform:  visible ? 'none' : 'translateY(18px)',
        transition: 'opacity 0.55s ease, transform 0.55s ease',
      }}
    >
      <h2 className="font-display text-xl tracking-[0.12em] text-warm/85 uppercase px-4 md:px-10 mb-4">
        {title}
      </h2>

      <div className="relative group/row">
        {/* Flèche gauche */}
        <button
          onClick={() => scroll(-1)}
          className="absolute left-3 top-[45%] -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-surface/90 border border-white/10 text-warm hidden md:flex items-center justify-center opacity-0 group-hover/row:opacity-100 hover:bg-accent/90 hover:text-surface hover:border-accent hover:scale-105 transition-all duration-200 shadow-lg"
        >
          <ChevronLeft className="size-5" />
        </button>

        {/* Rangée scrollable */}
        <div
          ref={rowRef}
          className="flex gap-3 overflow-x-auto no-scrollbar px-4 md:px-10 pb-3"
        >
          {items.map((m, i) => (
            <Card key={m.id ?? i} media={m} index={i} />
          ))}
        </div>

        {/* Flèche droite */}
        <button
          onClick={() => scroll(1)}
          className="absolute right-3 top-[45%] -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-surface/90 border border-white/10 text-warm hidden md:flex items-center justify-center opacity-0 group-hover/row:opacity-100 hover:bg-accent/90 hover:text-surface hover:border-accent hover:scale-105 transition-all duration-200 shadow-lg"
        >
          <ChevronRight className="size-5" />
        </button>

        {/* Fondus gauche/droite */}
        <div className="absolute left-0 top-0 bottom-3 w-4 md:w-10 bg-gradient-to-r from-surface to-transparent pointer-events-none z-10" />
        <div className="absolute right-0 top-0 bottom-3 w-4 md:w-10 bg-gradient-to-l from-surface to-transparent pointer-events-none z-10" />
      </div>
    </section>
  )
}
