import * as Dialog from '@radix-ui/react-dialog'
import { Minus, Pause, Play, Plus, RotateCcw, X } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react'
import { ErrorState, Loading } from './ui'
import '../styles/card-viewer.css'

type Point = { x: number; y: number }
type Pose = { scale: number; x: number; y: number; twist: number; panX: number; panY: number }
type Motion = 'auto' | 'inertia' | 'still'
type Velocity = { x: number; y: number; twist: number }
const initialPose: Pose = { scale: 1, x: 0, y: 0, twist: 0, panX: 0, panY: 0 }
const zeroVelocity: Velocity = { x: 0, y: 0, twist: 0 }
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const distance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y)
const angle = (a: Point, b: Point) => Math.atan2(b.y - a.y, b.x - a.x)

export function CardViewer({
  card,
  error,
  retry,
  onClose,
}: {
  card?: { image_url: string; name: string }
  error: Error | null
  retry: () => void
  onClose: () => void
}) {
  const stage = useRef<HTMLDivElement>(null)
  const opener = useRef(document.activeElement)
  const points = useRef(new Map<number, Point>())
  const backdropTap = useRef<Point | null>(null)
  const current = useRef(initialPose)
  const [pose, setPose] = useState(initialPose)
  const [dragging, setDragging] = useState(false)
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [imageAttempt, setImageAttempt] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [motion, setMotion] = useState<Motion>(reducedMotion ? 'still' : 'auto')
  const movement = useRef<Motion>(motion)
  const velocity = useRef<Velocity>(zeroVelocity)
  const lastMove = useRef(0)
  const sampledPointers = useRef(0)

  function changeMotion(next: Motion) {
    movement.current = next
    setMotion(next)
  }

  function stopMotion() {
    velocity.current = zeroVelocity
    changeMotion('still')
  }

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => {
      setReducedMotion(preference.matches)
      if (preference.matches) {
        velocity.current = zeroVelocity
        movement.current = 'still'
        setMotion('still')
      }
    }
    preference.addEventListener('change', sync)
    return () => preference.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    if (imageState !== 'ready' || error || motion === 'still') return
    let frame = 0
    let previous = 0
    const animate = (time: number) => {
      // Clamp elapsed time so returning to a background tab cannot fling the card.
      const dt = previous ? clamp((time - previous) / 1000, 0, 0.05) : 0
      previous = time
      if (!document.hidden && !points.current.size && movement.current !== 'still') {
        const next = { ...current.current }
        if (movement.current === 'auto') {
          next.y += 12 * dt
        } else {
          const decay = Math.exp(-1.6 * dt)
          // Integrate exponential friction independently of the display's frame rate.
          const travel = (1 - decay) / 1.6
          next.x += velocity.current.x * travel
          next.y += velocity.current.y * travel
          next.twist += velocity.current.twist * travel
          velocity.current = {
            x: velocity.current.x * decay,
            y: velocity.current.y * decay,
            twist: velocity.current.twist * decay,
          }
          if (Math.hypot(velocity.current.x, velocity.current.y, velocity.current.twist) < 0.5) {
            velocity.current = zeroVelocity
            movement.current = 'still'
            setMotion('still')
          }
        }
        current.current = next
        setPose(next)
      }
      frame = requestAnimationFrame(animate)
    }
    frame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(frame)
  }, [imageState, error, motion])

  function trackVelocity(delta: Velocity) {
    const now = performance.now()
    const dt = Math.max(8, now - lastMove.current) / 1000
    lastMove.current = now
    velocity.current = {
      x: velocity.current.x * 0.35 + clamp(delta.x / dt, -540, 540) * 0.65,
      y: velocity.current.y * 0.35 + clamp(delta.y / dt, -540, 540) * 0.65,
      twist: velocity.current.twist * 0.35 + clamp(delta.twist / dt, -540, 540) * 0.65,
    }
  }

  function update(next: Pose) {
    current.current = next
    setPose(next)
  }

  function zoom(factor: number) {
    update({ ...current.current, scale: clamp(current.current.scale * factor, 0.65, 2.5) })
  }

  function reset() {
    stopMotion()
    points.current.clear()
    backdropTap.current = null
    setDragging(false)
    update(initialPose)
  }

  const attachStage = useCallback((element: HTMLDivElement | null) => {
    stage.current = element
    if (!element) return
    // A native non-passive listener keeps the wheel inside this viewer.
    const wheel = (event: WheelEvent) => {
      event.preventDefault()
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1)
      const next = {
        ...current.current,
        scale: clamp(current.current.scale * Math.exp(-clamp(delta, -200, 200) * 0.002), 0.65, 2.5),
      }
      current.current = next
      setPose(next)
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => {
      element.removeEventListener('wheel', wheel)
      stage.current = null
    }
  }, [])

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    event.preventDefault()
    stopMotion()
    lastMove.current = performance.now()
    event.currentTarget.focus({ preventScroll: true })
    event.currentTarget.setPointerCapture(event.pointerId)
    points.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    backdropTap.current =
      points.current.size === 1 && event.target === event.currentTarget
        ? { x: event.clientX, y: event.clientY }
        : null
    setDragging(true)
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const previous = points.current.get(event.pointerId)
    if (!previous) return
    const next = { x: event.clientX, y: event.clientY }
    if (backdropTap.current && distance(backdropTap.current, next) > 6) backdropTap.current = null
    const before = [...points.current.values()]
    if (sampledPointers.current !== before.length) {
      velocity.current = zeroVelocity
      sampledPointers.current = before.length
      lastMove.current = performance.now() - 16
    }
    points.current.set(event.pointerId, next)
    const after = [...points.current.values()]
    const value = current.current
    if (before.length === 1) {
      const delta = { x: -(next.y - previous.y) * 0.55, y: (next.x - previous.x) * 0.55, twist: 0 }
      trackVelocity(delta)
      update({
        ...value,
        x: value.x + delta.x,
        y: value.y + delta.y,
      })
    } else {
      const turn = angle(after[0], after[1]) - angle(before[0], before[1])
      // Normalize across the -PI/PI seam so a two-finger twist never jumps.
      const degrees = (Math.atan2(Math.sin(turn), Math.cos(turn)) * 180) / Math.PI
      trackVelocity({ x: 0, y: 0, twist: degrees })
      const bounds = event.currentTarget.getBoundingClientRect()
      update({
        ...value,
        scale: clamp(
          (value.scale * distance(after[0], after[1])) /
            Math.max(1, distance(before[0], before[1])),
          0.65,
          2.5,
        ),
        twist: value.twist + degrees,
        panX: clamp(
          value.panX + (after[0].x + after[1].x - before[0].x - before[1].x) / 2,
          -bounds.width / 3,
          bounds.width / 3,
        ),
        panY: clamp(
          value.panY + (after[0].y + after[1].y - before[0].y - before[1].y) / 2,
          -bounds.height / 3,
          bounds.height / 3,
        ),
      })
    }
  }

  function pointerEnd(event: PointerEvent<HTMLDivElement>) {
    if (!points.current.has(event.pointerId)) return
    const close =
      event.type === 'pointerup' &&
      backdropTap.current &&
      points.current.size === 1 &&
      distance(backdropTap.current, { x: event.clientX, y: event.clientY }) <= 6
    points.current.delete(event.pointerId)
    backdropTap.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    if (!points.current.size) setDragging(false)
    if (
      event.type === 'pointerup' &&
      !points.current.size &&
      !close &&
      !reducedMotion &&
      performance.now() - lastMove.current < 100 &&
      Math.hypot(velocity.current.x, velocity.current.y, velocity.current.twist) > 2
    ) {
      changeMotion('inertia')
    } else if (event.type !== 'pointerup' || !points.current.size) {
      stopMotion()
      lastMove.current = performance.now()
    }
    if (close) onClose()
  }

  const lightX = Math.sin((pose.y * Math.PI) / 180)
  const lightY = Math.sin((pose.x * Math.PI) / 180)
  const style = {
    transform: `translate3d(${pose.panX}px, ${pose.panY}px, 0) scale(${pose.scale}) rotateX(${pose.x}deg) rotateY(${pose.y}deg) rotateZ(${pose.twist}deg)`,
    '--shine-x': `${50 + lightX * 40}%`,
    '--shine-y': `${40 - lightY * 40}%`,
    '--shine-opacity': 0.08 + (Math.abs(lightX) + Math.abs(lightY)) * 0.12,
    '--shadow-x': `${-lightX * 24}px`,
    '--shadow-y': `${26 + lightY * 14}px`,
  } as CSSProperties

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="card-viewer-overlay" />
        <Dialog.Content
          className="card-viewer"
          aria-describedby="card-viewer-help"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            stage.current?.focus()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (opener.current instanceof HTMLElement && opener.current.isConnected)
              opener.current.focus()
          }}
        >
          <Dialog.Title className="sr-only">
            {card ? `${card.name} · 卡片预览` : '卡片预览'}
          </Dialog.Title>
          <Dialog.Description className="sr-only" id="card-viewer-help">
            卡片打开后缓慢旋转。拖动可360度翻转，松手后惯性减速；按住可停住。
            双指捏合缩放、转动旋转、移动查看。鼠标滚轮或加减键缩放，方向键旋转，0 键复位并停止，Esc
            关闭。点击空白处也可关闭。
          </Dialog.Description>
          <div
            ref={attachStage}
            className="card-viewer-stage"
            data-dragging={dragging}
            tabIndex={0}
            role="group"
            aria-label="卡片互动区域"
            aria-describedby="card-viewer-help"
            onPointerDown={pointerDown}
            onPointerMove={pointerMove}
            onPointerUp={pointerEnd}
            onPointerCancel={pointerEnd}
            onLostPointerCapture={pointerEnd}
            onKeyDown={(event) => {
              if (
                !['+', '=', '-', '0', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
                  event.key,
                )
              )
                return
              event.preventDefault()
              if (event.key === '0') reset()
              else if (event.key === '+' || event.key === '=') zoom(1.15)
              else if (event.key === '-') zoom(1 / 1.15)
              else {
                stopMotion()
                update({
                  ...current.current,
                  x:
                    current.current.x +
                    (event.key === 'ArrowUp' ? 5 : event.key === 'ArrowDown' ? -5 : 0),
                  y:
                    current.current.y +
                    (event.key === 'ArrowRight' ? 5 : event.key === 'ArrowLeft' ? -5 : 0),
                })
              }
            }}
          >
            {error ? (
              <div
                className="card-viewer-status"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <ErrorState error={error} retry={retry} />
              </div>
            ) : (
              <>
                {(!card || imageState === 'loading') && (
                  <div className="card-viewer-status">
                    <Loading label="正在展开卡片…" />
                  </div>
                )}
                {card && imageState === 'error' && (
                  <div
                    className="card-viewer-status"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <ErrorState
                      error={new Error('卡片图片暂时没有加载成功')}
                      retry={() => {
                        setImageState('loading')
                        setImageAttempt((attempt) => attempt + 1)
                      }}
                    />
                  </div>
                )}
                {card && (
                  <div
                    className="card-viewer-card"
                    style={style}
                    data-ready={imageState === 'ready'}
                  >
                    <div className="card-viewer-front">
                      <img
                        key={`${card.image_url}-${imageAttempt}`}
                        src={card.image_url}
                        alt={card.name}
                        draggable={false}
                        onLoad={() => setImageState('ready')}
                        onError={() => setImageState('error')}
                      />
                      <span className="card-viewer-shine" aria-hidden="true" />
                    </div>
                    <div className="card-viewer-back" aria-hidden="true" />
                  </div>
                )}
              </>
            )}
          </div>
          <Dialog.Close asChild>
            <button className="card-viewer-close" aria-label="关闭" title="关闭（Esc）">
              <X size={22} />
            </button>
          </Dialog.Close>
          <div className="card-viewer-controls" role="group" aria-label="卡片查看工具">
            <button
              aria-label="缩小卡片"
              title="缩小"
              disabled={pose.scale <= 0.65}
              onClick={() => zoom(1 / 1.15)}
            >
              <Minus size={19} />
            </button>
            <output aria-label="缩放比例">{Math.round(pose.scale * 100)}%</output>
            <button
              aria-label="放大卡片"
              title="放大"
              disabled={pose.scale >= 2.5}
              onClick={() => zoom(1.15)}
            >
              <Plus size={19} />
            </button>
            <span className="card-viewer-divider" aria-hidden="true" />
            <button
              aria-label={motion === 'still' ? '开始旋转' : '暂停旋转'}
              title={motion === 'still' ? '开始旋转' : '暂停旋转'}
              onClick={() => {
                if (motion === 'still') changeMotion('auto')
                else stopMotion()
              }}
            >
              {motion === 'still' ? <Play size={18} /> : <Pause size={18} />}
            </button>
            <button aria-label="复位卡片" title="复位" onClick={reset}>
              <RotateCcw size={18} />
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
