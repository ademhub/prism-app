import React, { useCallback, useEffect, useRef } from 'react'
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from 'framer-motion'

const wrap = (min, max, value) => {
  const range = max - min
  return ((((value - min) % range) + range) % range) + min
}

export default function MarqueeAlongSvgPath({
  children,
  className,
  path,
  pathId,
  preserveAspectRatio = 'xMidYMid meet',
  showPath = false,
  width = '100%',
  height = '100%',
  viewBox = '0 0 100 100',
  baseVelocity = 5,
  direction = 'normal',
  easing,
  slowdownOnHover = false,
  slowDownFactor = 0.3,
  slowDownSpringConfig = { damping: 50, stiffness: 400 },
  useScrollVelocity = false,
  scrollAwareDirection = false,
  scrollSpringConfig = { damping: 50, stiffness: 400 },
  scrollContainer,
  repeat = 3,
  draggable = false,
  dragSensitivity = 0.2,
  dragVelocityDecay = 0.96,
  dragAwareDirection = false,
  grabCursor = false,
  enableRollingZIndex = true,
  zIndexBase = 1,
  zIndexRange = 10,
  cssVariableInterpolation = [],
  responsive = false,
}) {
  const container = useRef(null)
  const marqueeContainerRef = useRef(null)
  const baseOffset = useMotionValue(0)
  const pathRef = useRef(null)
  const itemRefs = useRef(new Map())

  useEffect(() => {
    if (!responsive) return
    const [, , vbWidth, vbHeight] = viewBox.split(' ').map(Number)
    const originalWidth = vbWidth || 100
    const originalHeight = vbHeight || 100

    const updateScale = () => {
      const wrapper = container.current
      const marqueeContainer = marqueeContainerRef.current
      if (!wrapper || !marqueeContainer) return

      const scaleX = wrapper.clientWidth / originalWidth
      const scaleY = wrapper.clientHeight / originalHeight
      const scale = Math.min(scaleX, scaleY)

      const offsetX = (wrapper.clientWidth - originalWidth * scale) / 2
      const offsetY = (wrapper.clientHeight - originalHeight * scale) / 2

      marqueeContainer.style.width = `${originalWidth}px`
      marqueeContainer.style.height = `${originalHeight}px`
      marqueeContainer.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`
      marqueeContainer.style.transformOrigin = 'top left'
    }

    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [responsive, viewBox])

  const items = React.useMemo(() => {
    const childrenArray = React.Children.toArray(children)
    return childrenArray.flatMap((child, childIndex) =>
      Array.from({ length: repeat }, (_, repeatIndex) => {
        const itemIndex = repeatIndex * childrenArray.length + childIndex
        const key = `${childIndex}-${repeatIndex}`
        return { child, childIndex, repeatIndex, itemIndex, key }
      })
    )
  }, [children, repeat])

  const calculateZIndex = useCallback(
    (offsetDistance) => {
      if (!enableRollingZIndex) return undefined
      return Math.floor(zIndexBase + (offsetDistance / 100) * zIndexRange)
    },
    [enableRollingZIndex, zIndexBase, zIndexRange]
  )

  const id = pathId || `marquee-path-${Math.random().toString(36).substring(7)}`

  const { scrollY } = useScroll({ container: scrollContainer || container })
  const scrollVelocity = useVelocity(scrollY)
  const smoothVelocity = useSpring(scrollVelocity, scrollSpringConfig)

  const isHovered = useRef(false)
  const isDragging = useRef(false)
  const dragVelocity = useRef(0)
  const directionFactor = useRef(direction === 'normal' ? 1 : -1)

  const hoverFactorValue = useMotionValue(1)
  const defaultVelocity = useMotionValue(1)
  const smoothHoverFactor = useSpring(hoverFactorValue, slowDownSpringConfig)

  const velocityFactor = useTransform(
    useScrollVelocity ? smoothVelocity : defaultVelocity,
    [0, 1000],
    [0, 5],
    { clamp: false }
  )

  useAnimationFrame((_, delta) => {
    if (isDragging.current && draggable) {
      baseOffset.set(baseOffset.get() + dragVelocity.current)
      dragVelocity.current *= 0.9
      if (Math.abs(dragVelocity.current) < 0.01) dragVelocity.current = 0
      return
    }

    hoverFactorValue.set(isHovered.current && slowdownOnHover ? slowDownFactor : 1)

    let moveBy =
      directionFactor.current * baseVelocity * (delta / 1000) * smoothHoverFactor.get()

    if (scrollAwareDirection && !isDragging.current) {
      if (velocityFactor.get() < 0) directionFactor.current = -1
      else if (velocityFactor.get() > 0) directionFactor.current = 1
    }

    moveBy += directionFactor.current * moveBy * velocityFactor.get()

    if (draggable) {
      moveBy += dragVelocity.current
      if (dragAwareDirection && Math.abs(dragVelocity.current) > 0.1)
        directionFactor.current = Math.sign(dragVelocity.current)
      if (!isDragging.current)
        dragVelocity.current = Math.abs(dragVelocity.current) > 0.01
          ? dragVelocity.current * dragVelocityDecay
          : 0
    }

    baseOffset.set(baseOffset.get() + moveBy)
  })

  const lastPointer = useRef({ x: 0, y: 0 })

  const handlePointerDown = (e) => {
    if (!draggable) return
    e.currentTarget.setPointerCapture(e.pointerId)
    if (grabCursor) e.currentTarget.style.cursor = 'grabbing'
    isDragging.current = true
    lastPointer.current = { x: e.clientX, y: e.clientY }
    dragVelocity.current = 0
  }

  const handlePointerMove = (e) => {
    if (!draggable || !isDragging.current) return
    const dx = e.clientX - lastPointer.current.x
    const dy = e.clientY - lastPointer.current.y
    const delta = Math.sqrt(dx * dx + dy * dy)
    dragVelocity.current = (dx > 0 ? delta : -delta) * dragSensitivity
    lastPointer.current = { x: e.clientX, y: e.clientY }
  }

  const handlePointerUp = (e) => {
    if (!draggable) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    isDragging.current = false
    if (grabCursor) e.currentTarget.style.cursor = 'grab'
  }

  return (
    <div
      ref={container}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className={`relative ${className || ''}`}
    >
      <div ref={marqueeContainerRef} className="relative w-full h-full" style={{ contain: 'layout style' }}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={width}
          height={height}
          viewBox={viewBox}
          preserveAspectRatio={preserveAspectRatio}
          className="w-full h-full"
        >
          <path
            id={id}
            d={path}
            stroke={showPath ? 'currentColor' : 'none'}
            fill="none"
            ref={pathRef}
          />
        </svg>

        {items.map(({ child, repeatIndex, itemIndex, key }) => {
          // eslint-disable-next-line react-hooks/rules-of-hooks
          const itemOffset = useTransform(baseOffset, (v) => {
            const position = (itemIndex * 100) / items.length
            const wrapped = wrap(0, 100, v + position)
            return `${easing ? easing(wrapped / 100) * 100 : wrapped}%`
          })

          // eslint-disable-next-line react-hooks/rules-of-hooks
          const currentOffsetDistance = useMotionValue(0)

          // eslint-disable-next-line react-hooks/rules-of-hooks
          const zIndex = useTransform(currentOffsetDistance, (value) => calculateZIndex(value))

          // eslint-disable-next-line react-hooks/rules-of-hooks
          useEffect(() => {
            return itemOffset.on('change', (value) => {
              const match = value.match(/^([\d.]+)%$/)
              if (match?.[1]) currentOffsetDistance.set(parseFloat(match[1]))
            })
          }, [itemOffset, currentOffsetDistance])

          return (
            <motion.div
              key={key}
              ref={(el) => { if (el) itemRefs.current.set(key, el) }}
              className={`absolute top-0 left-0${draggable && grabCursor ? ' cursor-grab' : ''}`}
              style={{
                offsetPath: `path('${path}')`,
                offsetDistance: itemOffset,
                zIndex: enableRollingZIndex ? zIndex : undefined,
                willChange: 'offset-distance',
                backfaceVisibility: 'hidden',
              }}
              aria-hidden={repeatIndex > 0}
              onMouseEnter={() => { isHovered.current = true }}
              onMouseLeave={() => { isHovered.current = false }}
            >
              {child}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
