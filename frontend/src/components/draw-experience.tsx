import * as Dialog from '@radix-ui/react-dialog'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Check, Sparkles, Star, Volume2, VolumeX, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { api } from '../api/client'
import type { Acquisition, Card, Draw, Page } from '../api/types'
import { useAccounts, useToast } from '../app/context'
import { rarityNames } from './icons'
import { Button, ErrorState, Loading } from './ui'
import '../styles/draw-experience.css'
import { useDrawSounds } from './use-draw-sounds'

type Phase = 'choosing' | 'selecting' | 'revealing' | 'flying' | 'landing'
type Flight = CSSProperties & { '--fly-x': string; '--fly-y': string; '--fly-scale': number }

export function DrawModal({
  rewardId,
  onClose,
  preview = false,
}: {
  rewardId: string
  onClose: () => void
  preview?: boolean
}) {
  const { activeId } = useAccounts()
  const client = useQueryClient()
  const toast = useToast()
  const sound = useDrawSounds()
  const isPreview = import.meta.env.DEV && preview
  const [phase, setPhase] = useState<Phase>('choosing')
  const [selected, setSelected] = useState<string | null>(null)
  const [received, setReceived] = useState<Card | null>(null)
  const [centered, setCentered] = useState(false)
  const [entered, setEntered] = useState(false)
  const [imageState, setImageState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [imageAttempt, setImageAttempt] = useState(0)
  const [flight, setFlight] = useState<Flight | null>(null)
  const picked = useRef<HTMLButtonElement | null>(null)
  const selectionLock = useRef(false)
  const finishRef = useRef(onClose)
  finishRef.current = onClose
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const query = useQuery<Draw>({
    queryKey: ['child', activeId, isPreview ? 'draw-preview' : 'draw', rewardId],
    queryFn: async ({ signal }) => {
      if (isPreview) {
        const catalog = await api<Page<Card>>('/me/collection?page=1&page_size=3', {
          accountId: activeId,
          signal,
        })
        if (catalog.items.length < 3)
          throw new Error('需要至少三张可用卡片才能预览，请先在后台添加卡片。')
        return {
          id: 'draw-preview',
          reward_id: 'draw-preview',
          state: 'open',
          selected_option_id: null,
          options: catalog.items
            .slice(0, 3)
            .map((card, index) => ({ id: `preview-${card.id}`, position: index, card })),
        }
      }
      return api<Draw>(`/me/rewards/${rewardId}/draw-session`, {
        method: 'POST',
        accountId: activeId,
        signal,
      })
    },
  })
  const choose = useMutation({
    mutationFn: async (optionId: string) => {
      if (isPreview)
        return { card: query.data!.options.find((option) => option.id === optionId)!.card }
      return api<Acquisition>(`/me/draw-sessions/${query.data!.id}/selection`, {
        method: 'PUT',
        accountId: activeId,
        body: { option_id: optionId },
      })
    },
    onSuccess: (data, optionId) => {
      setReceived(data.card)
      if (!isPreview) {
        client.setQueryData<Draw>(['child', activeId, 'draw', rewardId], (draw) =>
          draw ? { ...draw, state: 'claimed', selected_option_id: optionId } : draw,
        )
        void client.invalidateQueries({
          queryKey: ['child', activeId],
          predicate: (query) => query.queryKey[2] !== 'draw',
        })
      }
    },
  })
  const card =
    received ??
    query.data?.options.find((option) => option.id === (selected ?? query.data?.selected_option_id))
      ?.card
  // A completed session can be reopened after a refresh without drawing again.
  const restored = !selected && query.data?.state === 'claimed'
  const revealed = phase === 'revealing' || phase === 'flying' || phase === 'landing' || restored

  useEffect(() => {
    if (phase !== 'selecting') return
    const timer = window.setTimeout(() => setCentered(true), reducedMotion ? 60 : 650)
    return () => window.clearTimeout(timer)
  }, [phase, reducedMotion])

  useEffect(() => {
    if (phase === 'selecting' && centered && received) setPhase('revealing')
  }, [phase, centered, received])

  useEffect(() => {
    if (phase === 'revealing') {
      const timer = window.setTimeout(() => sound.play('reveal'), reducedMotion ? 0 : 420)
      return () => window.clearTimeout(timer)
    }
    if (phase === 'flying') sound.play('fly')
    if (phase === 'landing') sound.play('collect')
  }, [phase, reducedMotion, sound.play])

  const collect = useCallback(() => {
    if (!picked.current || !card || phase !== 'revealing') return
    const bounds = picked.current.getBoundingClientRect()
    const target = document
      .querySelector('.mobile-nav a[href="/collection"]')
      ?.getBoundingClientRect()
    const targetX = target ? target.left + target.width / 2 : window.innerWidth / 2
    const targetY = target ? target.top + target.height / 2 : window.innerHeight - 40
    setFlight({
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
      '--fly-x': `${targetX - bounds.left - bounds.width / 2}px`,
      '--fly-y': `${targetY - bounds.top - bounds.height / 2}px`,
      '--fly-scale': Math.min(0.16, 30 / bounds.width),
    })
    setPhase('flying')
  }, [card, phase])

  useEffect(() => {
    if (phase !== 'revealing' || imageState !== 'ready') return
    // Leave time to enjoy the reveal; the button can send it to the album sooner.
    const timer = window.setTimeout(collect, reducedMotion ? 3600 : 5200)
    return () => window.clearTimeout(timer)
  }, [phase, imageState, reducedMotion, collect])

  useEffect(() => {
    if (phase !== 'flying') return
    const timer = window.setTimeout(() => setPhase('landing'), reducedMotion ? 200 : 1050)
    return () => window.clearTimeout(timer)
  }, [phase, reducedMotion])

  useEffect(() => {
    if (phase !== 'landing') return
    const target = document.querySelector('.mobile-nav a[href="/collection"]')
    const pulse = target?.animate(
      reducedMotion
        ? [{ backgroundColor: '#e7d9fa' }, { backgroundColor: '#eee8fa' }]
        : [
            { transform: 'scale(1)', backgroundColor: '#e7d9fa', boxShadow: '0 0 0 0 #b49ad980' },
            {
              transform: 'translateY(-9px) scale(1.16)',
              backgroundColor: '#e7d9fa',
              boxShadow: '0 0 0 18px #b49ad900',
              offset: 0.45,
            },
            { transform: 'scale(1)', backgroundColor: '#eee8fa', boxShadow: '0 0 0 0 #b49ad900' },
          ],
      { duration: reducedMotion ? 300 : 850, easing: 'cubic-bezier(.2,.8,.2,1)' },
    )
    const timer = window.setTimeout(
      () => {
        toast(
          isPreview
            ? '动效预览完成，可以再次体验；真实收藏没有变化。'
            : '已收入图鉴，快去看看新朋友吧 ✨',
        )
        finishRef.current()
      },
      reducedMotion ? 400 : 950,
    )
    return () => {
      window.clearTimeout(timer)
      pulse?.cancel()
    }
  }, [phase, reducedMotion, toast, isPreview])

  const status =
    restored || phase === 'landing'
      ? '已收入图鉴'
      : phase === 'flying'
        ? '带着小惊喜，飞进图鉴！'
        : phase === 'revealing'
          ? '哇，是你的新朋友！'
          : phase === 'selecting'
            ? '小惊喜正在苏醒…'
            : '哪张卡片在呼唤你？'

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="draw-overlay" />
        <Dialog.Content className="draw-experience" data-phase={restored ? 'restored' : phase}>
          <header className="draw-heading">
            <span className="draw-eyebrow">
              <Sparkles size={15} /> {isPreview ? '动效预览 · 不消耗奖励' : '今日份的小幸运'}
            </span>
            <Dialog.Title>{status}</Dialog.Title>
            <Dialog.Description>
              {phase === 'choosing' && !restored
                ? '轻点一张，揭开属于你的惊喜'
                : phase === 'revealing'
                  ? '欣赏一下新朋友，它会自动飞入图鉴'
                  : revealed
                    ? '每一份努力，都值得被好好收藏'
                    : '猜猜会遇见什么可爱的新朋友？'}
            </Dialog.Description>
          </header>
          <button
            className="draw-sound-toggle"
            onClick={sound.toggle}
            aria-label={sound.enabled ? '关闭抽卡音效' : '开启抽卡音效'}
            aria-pressed={sound.enabled}
            title={sound.enabled ? '关闭音效' : '开启音效'}
          >
            {sound.enabled ? <Volume2 size={19} /> : <VolumeX size={19} />}
          </button>
          <Dialog.Close asChild>
            <button className="draw-close" aria-label="关闭">
              <X size={21} />
            </button>
          </Dialog.Close>

          <div className="draw-stage">
            <div className="draw-orbit" aria-hidden="true" />
            <div className="draw-stardust" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i} style={{ '--i': i } as CSSProperties}>
                  {i % 3 ? '✦' : '·'}
                </span>
              ))}
            </div>
            {query.isPending ? (
              <Loading label="正在唤醒三张神秘卡片…" />
            ) : query.error ? (
              <ErrorState
                error={query.error}
                retry={() => {
                  void query.refetch()
                }}
              />
            ) : (
              query.data.options.map((option, index) => {
                const isPicked = option.id === (selected ?? query.data.selected_option_id)
                const showFront = isPicked && revealed
                return (
                  <button
                    key={option.id}
                    ref={isPicked ? picked : undefined}
                    className={`draw-pick ${isPicked ? 'is-picked' : ''} ${(selected && !isPicked) || (restored && !isPicked) ? 'is-dismissed' : ''}`}
                    style={
                      {
                        '--slot': index - 1,
                        '--delay': `${index * -1.1}s`,
                        '--entry-delay': `${[0, 100, 220][index] ?? index * 110}ms`,
                        '--entry-duration': `${[1080, 1160, 1120][index] ?? 1120}ms`,
                        '--entry-drift': `${[-22, 12, 26][index] ?? 0}px`,
                        '--entry-lean': `${[-10, 4, 9][index] ?? 0}deg`,
                      } as CSSProperties
                    }
                    aria-label={showFront ? card?.name : `选择第${index + 1}张神秘卡片`}
                    aria-hidden={!!(selected && !isPicked) || (restored && !isPicked)}
                    disabled={phase !== 'choosing' || restored || (!entered && !reducedMotion)}
                    onPointerMove={(event) => {
                      if (phase !== 'choosing' || reducedMotion || event.pointerType === 'touch')
                        return
                      const bounds = event.currentTarget.getBoundingClientRect()
                      const x = Math.max(
                        0,
                        Math.min(1, (event.clientX - bounds.left) / bounds.width),
                      )
                      const y = Math.max(
                        0,
                        Math.min(1, (event.clientY - bounds.top) / bounds.height),
                      )
                      event.currentTarget.style.setProperty('--tilt-x', `${(0.5 - y) * 12}deg`)
                      event.currentTarget.style.setProperty('--tilt-y', `${(x - 0.5) * 16}deg`)
                      event.currentTarget.style.setProperty('--glare-x', `${x * 100}%`)
                      event.currentTarget.style.setProperty('--glare-y', `${y * 100}%`)
                    }}
                    onPointerLeave={(event) => {
                      event.currentTarget.style.setProperty('--tilt-x', '0deg')
                      event.currentTarget.style.setProperty('--tilt-y', '0deg')
                    }}
                    onClick={(event) => {
                      if (selectionLock.current) return
                      const floating = event.currentTarget.querySelector('.draw-card-float')
                      if (floating && !reducedMotion)
                        floating.animate(
                          [
                            { transform: getComputedStyle(floating).transform },
                            { transform: 'translateY(0)' },
                          ],
                          { duration: 450, easing: 'ease-out', fill: 'forwards' },
                        )
                      event.currentTarget.style.setProperty('--tilt-x', '0deg')
                      event.currentTarget.style.setProperty('--tilt-y', '0deg')
                      sound.play('pick')
                      selectionLock.current = true
                      setSelected(option.id)
                      setPhase('selecting')
                      choose.mutate(option.id)
                    }}
                  >
                    <span
                      className="draw-card-enter"
                      data-entering={!entered && !restored && !reducedMotion}
                      onAnimationEnd={(event) => {
                        if (
                          event.target === event.currentTarget &&
                          event.animationName === 'draw-card-drop' &&
                          index === query.data.options.length - 1
                        )
                          setEntered(true)
                      }}
                    >
                      <span className="draw-card-float">
                        <span className="draw-card-tilt">
                          <span className={`draw-card-turn ${showFront ? 'is-front' : ''}`}>
                            <span className="draw-card-back" aria-hidden="true">
                              <span className="draw-back-brand">小小成长家</span>
                              <span className="draw-back-emblem">
                                <Sparkles />
                                <Star />
                              </span>
                              <span className="draw-back-caption">藏着一份小惊喜</span>
                              <i className="draw-back-star star-one">✧</i>
                              <i className="draw-back-star star-two">✧</i>
                            </span>
                            <span
                              className={`draw-card-front rarity-${isPicked ? card?.rarity : 'common'}`}
                              aria-hidden={!showFront}
                            >
                              {isPicked && card && (
                                <>
                                  <img
                                    key={`${card.image_url}-${imageAttempt}`}
                                    src={card.image_url}
                                    alt={showFront ? card.name : ''}
                                    draggable={false}
                                    onLoad={() => setImageState('ready')}
                                    onError={() => setImageState('error')}
                                  />
                                  {imageState !== 'ready' && (
                                    <span className="draw-image-placeholder">
                                      <Sparkles size={36} />
                                      <span>{card.name}</span>
                                    </span>
                                  )}
                                </>
                              )}
                              <span className="draw-card-sheen" />
                            </span>
                          </span>
                        </span>
                      </span>
                    </span>
                    <span className="draw-pick-number" aria-hidden="true">
                      0{index + 1}
                    </span>
                  </button>
                )
              })
            )}
            {revealed && phase !== 'flying' && phase !== 'landing' && (
              <div className="draw-reveal-burst" aria-hidden="true">
                {Array.from({ length: 14 }, (_, i) => (
                  <i key={i} style={{ '--i': i } as CSSProperties} />
                ))}
              </div>
            )}
          </div>

          <footer className="draw-footer" aria-live="polite" aria-atomic="true">
            {choose.error ? (
              <div className="draw-retry">
                <p role="alert">{choose.error.message}</p>
                <Button onClick={() => choose.mutate(selected!)} disabled={choose.isPending}>
                  再试一次，揭开这张卡
                </Button>
              </div>
            ) : revealed && card ? (
              <div className="draw-discovery">
                {phase === 'flying' || phase === 'landing' ? (
                  <p className="draw-collected">
                    <Check size={19} />
                    {phase === 'landing' ? '已收入图鉴' : '正在收入图鉴…'}
                  </p>
                ) : (
                  <>
                    <span className={`rarity-tag rarity-${card.rarity}`}>
                      {rarityNames[card.rarity]} · {card.set_name}
                    </span>
                    <h2>{card.name}</h2>
                    <p className="draw-knowledge">{card.description}</p>
                    {imageState === 'error' && (
                      <button
                        className="draw-image-retry"
                        onClick={() => {
                          setImageState('loading')
                          setImageAttempt((n) => n + 1)
                        }}
                      >
                        图片迷路了，点这里重新加载
                      </button>
                    )}
                    <div className="draw-actions">
                      <Button className="draw-collect" onClick={restored ? onClose : collect}>
                        <BookOpen size={17} />
                        {restored ? '完成' : '收入我的图鉴'}
                        <Sparkles size={15} />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="draw-invitation">
                <span className="draw-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <p>
                  {phase === 'selecting'
                    ? '就是这张！让惊喜再转一小圈'
                    : '三张神秘卡片，一次心动相遇'}
                </p>
                <small>
                  {phase === 'selecting'
                    ? '正在为你打开…'
                    : '选中后会自动收藏 · 还没准备好也可以稍后再来'}
                </small>
              </div>
            )}
          </footer>
          {flight && phase === 'flying' && card && (
            <div
              className={`draw-flying-card rarity-${card.rarity}`}
              style={flight}
              aria-hidden="true"
            >
              {imageState === 'ready' ? <img src={card.image_url} alt="" /> : <Sparkles />}
            </div>
          )}
          {phase === 'landing' && (
            <div className="draw-arrived" aria-hidden="true">
              <Sparkles size={32} />
              <span>+1</span>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
