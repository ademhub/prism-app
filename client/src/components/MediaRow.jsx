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

const btnCls = "w-8 h-8 rounded-full bg-white/10 border border-white/25 text-white flex items-center justify-center hover:bg-accent hover:border-accent hover:scale-110 active:scale-95 transition-all duration-200 shrink-0"

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
      <div className="flex items-center justify-between px-4 md:px-10 mb-4">
        <h2 className="font-display text-xl tracking-[0.12em] text-warm/85 uppercase">
          {title}
        </h2>
        <div className="flex gap-2">
          <button onClick={() => scroll(-1)} className={btnCls}>
            <ChevronLeft className="size-4" />
          </button>
          <button onClick={() => scroll(1)} className={btnCls}>
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div className="relative">
        <div
          ref={rowRef}
          className="flex gap-3 overflow-x-auto no-scrollbar px-4 md:px-10 pb-3"
        >
          {items.map((m, i) => (
            <Card key={m.id ?? i} media={m} index={i} />
          ))}
        </div>
        {/* Fondus gauche/droite */}
        <div className="absolute left-0 top-0 bottom-3 w-4 md:w-10 bg-gradient-to-r from-surface to-transparent pointer-events-none z-10" />
        <div className="absolute right-0 top-0 bottom-3 w-4 md:w-10 bg-gradient-to-l from-surface to-transparent pointer-events-none z-10" />
      </div>
    </section>
  )
}
