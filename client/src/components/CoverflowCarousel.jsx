import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const cn = (...classes) => classes.filter(Boolean).join(' ')

const useIsoLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

export function CoverflowCarousel({
  slides,
  rotate = 44,
  depth = 0.6,
  perspective = 3,
  falloff = 0.56,
  fade = 0.1,
  cardWidth = 'clamp(90px, 26vw, 160px)',
  gap = 0.08,
  loop = true,
  showCaption = false,
  showPagination = false,
  showNavigation = false,
  noDrag = false,
  autoAdvanceMs = 0,
  onSlideChange,
  onSlideClick,
  label = 'Cover carousel',
  className,
  cardClassName,
}) {
  const count = slides.length

  const frameRef = React.useRef(null)
  const cardRefs = React.useRef([])
  const posRef = React.useRef(0)
  const targetRef = React.useRef(0)
  const widthRef = React.useRef(0)
  const rafRef = React.useRef(null)
  const dragRef = React.useRef(null)
  const autoRef = React.useRef(null)

  const [selected, setSelected] = React.useState(0)

  const indexAt = React.useCallback(
    (pos) => ((Math.round(pos) % count) + count) % count,
    [count],
  )

  const paint = React.useCallback(() => {
    const width = widthRef.current
    if (!width) return
    const pitch = width * (1 + gap)
    const pos = posRef.current

    cardRefs.current.forEach((card, index) => {
      if (!card) return
      let offset = index - pos
      if (loop) {
        offset = ((offset % count) + count) % count
        if (offset > count / 2) offset -= count
      }
      const distance = Math.abs(offset)
      const ramp = Math.pow(distance, falloff)
      const tilt = Math.min(rotate * ramp, 82) * Math.sign(offset)

      card.style.transform =
        `translateX(calc(-50% + ${offset * pitch}px)) ` +
        `translateZ(${-depth * width * ramp}px) rotateY(${-tilt}deg)`

      const edge = loop ? Math.min(1, Math.max(0, count / 2 - distance)) : 1
      card.style.opacity = String(Math.max(0, 1 - fade * distance) * edge)
      card.style.zIndex = String(100 - Math.round(distance))
    })
  }, [count, depth, fade, falloff, gap, loop, rotate])

  const settle = React.useCallback(
    (target) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      targetRef.current = target
      const idx = indexAt(target)
      setSelected(idx)
      onSlideChange?.(idx)

      const step = () => {
        const remaining = target - posRef.current
        if (Math.abs(remaining) < 0.0004) {
          posRef.current = target
          paint()
          rafRef.current = null
          return
        }
        posRef.current += remaining * 0.16
        paint()
        rafRef.current = requestAnimationFrame(step)
      }
      rafRef.current = requestAnimationFrame(step)
    },
    [indexAt, onSlideChange, paint],
  )

  const clamp = React.useCallback(
    (pos) => (loop ? pos : Math.max(0, Math.min(count - 1, pos))),
    [count, loop],
  )

  const goTo = React.useCallback(
    (index) => {
      const target = loop
        ? index + Math.round((targetRef.current - index) / count) * count
        : index
      settle(clamp(target))
    },
    [clamp, count, loop, settle],
  )

  const nudge = React.useCallback(
    (by) => settle(clamp(Math.round(targetRef.current) + by)),
    [clamp, settle],
  )

  // ── Auto-advance ─────────────────────────────────────────────────────────────
  const resetAuto = React.useCallback(() => {
    if (!autoAdvanceMs) return
    if (autoRef.current) clearInterval(autoRef.current)
    autoRef.current = setInterval(() => nudge(1), autoAdvanceMs)
  }, [autoAdvanceMs, nudge])

  React.useEffect(() => {
    if (!autoAdvanceMs) return
    resetAuto()
    return () => { if (autoRef.current) clearInterval(autoRef.current) }
  }, [autoAdvanceMs, resetAuto])

  const onPointerDown = (event) => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    targetRef.current = posRef.current
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      pos: posRef.current,
      v: 0,
      t: performance.now(),
    }
    if (autoAdvanceMs) resetAuto()
  }

  const onPointerMove = (event) => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    const pitch = widthRef.current * (1 + gap)
    if (!pitch) return
    const now = performance.now()
    const previous = posRef.current
    posRef.current = clamp(drag.pos - (event.clientX - drag.x) / pitch)
    drag.v = ((posRef.current - previous) / Math.max(now - drag.t, 1)) * 1000
    drag.t = now
    const index = indexAt(posRef.current)
    if (index !== selected) {
      setSelected(index)
      onSlideChange?.(index)
    }
    paint()
  }

  const endDrag = (event) => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    dragRef.current = null
    const carried = Math.max(-2, Math.min(2, drag.v * 0.18))
    settle(clamp(Math.round(posRef.current + carried)))
  }

  useIsoLayoutEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    const measure = () => {
      const card = cardRefs.current[0]
      if (!card) return
      widthRef.current = card.offsetWidth
      paint()
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(frame)
    return () => observer.disconnect()
  }, [paint])

  React.useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (autoRef.current) clearInterval(autoRef.current)
    },
    [],
  )

  const active = slides[selected]

  return (
    <div
      className={cn('w-full', className)}
      style={{ '--cf-card': cardWidth }}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
    >
      <div className="relative">
        <div
          ref={frameRef}
          tabIndex={noDrag ? -1 : 0}
          onPointerDown={noDrag ? undefined : onPointerDown}
          onPointerMove={noDrag ? undefined : onPointerMove}
          onPointerUp={noDrag ? undefined : endDrag}
          onPointerCancel={noDrag ? undefined : endDrag}
          onKeyDown={noDrag ? undefined : (event) => {
            if (event.key === 'ArrowLeft') { event.preventDefault(); nudge(-1) }
            else if (event.key === 'ArrowRight') { event.preventDefault(); nudge(1) }
          }}
          className={cn('overflow-hidden py-6 outline-none', noDrag ? 'cursor-default' : 'cursor-grab active:cursor-grabbing')}
          style={{
            perspective: `calc(var(--cf-card) * ${perspective})`,
            touchAction: 'pan-y',
          }}
        >
          <div
            className="relative select-none"
            style={{
              height: 'calc(var(--cf-card) * 1.5)',
              transformStyle: 'preserve-3d',
            }}
          >
            {slides.map((slide, index) => (
              <div
                key={index}
                ref={(node) => { cardRefs.current[index] = node }}
                role="group"
                aria-roledescription="slide"
                aria-label={`${index + 1} of ${count}`}
                onClick={() => onSlideClick?.(index)}
                className={cn(
                  'absolute left-1/2 top-0 overflow-hidden rounded-2xl shadow-2xl will-change-transform',
                  onSlideClick ? 'cursor-pointer' : '',
                  cardClassName,
                )}
                style={{
                  width: 'var(--cf-card)',
                  height: 'calc(var(--cf-card) * 1.5)',
                }}
              >
                <img
                  src={slide.src}
                  alt={slide.alt}
                  draggable={false}
                  className="h-full w-full select-none object-cover"
                />
              </div>
            ))}
          </div>
        </div>

        {showNavigation && (
          <>
            <button
              type="button"
              aria-label="Previous slide"
              onClick={() => { nudge(-1); resetAuto() }}
              className="absolute left-3 top-1/2 z-[200] -translate-y-1/2 rounded-full bg-black/50 p-2 text-white backdrop-blur transition hover:bg-black/70"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              aria-label="Next slide"
              onClick={() => { nudge(1); resetAuto() }}
              className="absolute right-3 top-1/2 z-[200] -translate-y-1/2 rounded-full bg-black/50 p-2 text-white backdrop-blur transition hover:bg-black/70"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>

      {showCaption && active?.title && (
        <div key={selected} className="mt-3 flex flex-col items-center px-6">
          <p className="text-sm font-semibold tracking-tight text-white drop-shadow">{active.title}</p>
        </div>
      )}

      {showPagination && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              type="button"
              aria-label={`Go to slide ${index + 1}`}
              onClick={() => { goTo(index); resetAuto() }}
              className={cn(
                'size-1.5 rounded-full bg-white transition-opacity',
                index === selected ? 'opacity-100' : 'opacity-30',
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}
