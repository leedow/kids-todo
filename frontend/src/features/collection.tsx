import { useQuery } from '@tanstack/react-query'
import { BookOpen, Check, Leaf, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api/client'
import type { CardCategory, CardDetail, CardSet, OwnedCard, Page } from '../api/types'
import { useAccounts } from '../app/context'
import { rarityNames } from '../components/icons'
import { CardViewer } from '../components/card-viewer'
import { Empty, ErrorState, Loading, Pager } from '../components/ui'

export function CardDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { activeId } = useAccounts()
  const query = useQuery({
    queryKey: ['child', activeId, 'card-detail', id],
    queryFn: ({ signal }) =>
      api<CardDetail>(`/me/collection/cards/${id}`, { accountId: activeId, signal }),
  })
  return (
    <CardViewer
      card={query.data}
      error={query.error}
      retry={() => void query.refetch()}
      onClose={onClose}
    />
  )
}

export function CollectionPage() {
  const { activeId } = useAccounts()
  const [setId, setSetId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [rarity, setRarity] = useState('')
  const [owned, setOwned] = useState(false)
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<string | null>(null)
  const sets = useQuery({
    queryKey: ['child', activeId, 'collection-sets'],
    queryFn: ({ signal }) =>
      api<{ items: CardSet[] }>('/me/collection/sets', { accountId: activeId, signal }),
  })
  const categories = useQuery({
    queryKey: ['child', activeId, 'catalog'],
    queryFn: ({ signal }) =>
      api<{ items: CardCategory[] }>('/catalog/categories', { accountId: activeId, signal }),
  })
  const query = useQuery({
    queryKey: ['child', activeId, 'collection', setId, categoryId, rarity, owned, page],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ page: String(page), owned_only: String(owned) })
      if (setId) params.set('set_id', setId)
      if (categoryId) params.set('category_id', categoryId)
      if (rarity) params.set('rarity', rarity)
      return api<Page<OwnedCard>>(`/me/collection?${params}`, { accountId: activeId, signal })
    },
  })
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">MY LITTLE WONDERS</span>
          <h1>
            我的卡片图鉴 <Sparkles size={27} />
          </h1>
          <p>每张卡片，都是一段努力的小小纪念。</p>
        </div>
        <span className="heading-book">
          <BookOpen size={41} />
        </span>
      </div>
      <div className="set-cards">
        {sets.data?.items.map((set) => (
          <button
            key={set.id}
            className={`set-card ${setId === set.id ? 'selected' : ''}`}
            onClick={() => {
              setSetId(setId === set.id ? '' : set.id)
              setPage(1)
            }}
          >
            <span className="set-card-icon">
              <Leaf size={26} />
            </span>
            <span>
              <strong>{set.name}</strong>
              <small>
                已点亮 {set.owned_unique} / {set.total}
              </small>
              <span className="progress-track">
                <span
                  style={{
                    width: `${set.total ? ((set.owned_unique ?? 0) / set.total) * 100 : 0}%`,
                  }}
                />
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="collection-filters">
        <label className="sr-only" htmlFor="category-filter">
          分类
        </label>
        <select
          id="category-filter"
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value)
            setSetId('')
            setPage(1)
          }}
        >
          <option value="">全部分类</option>
          {categories.data?.items.map((c) => (
            <option value={c.id} key={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="set-filter">
          卡片集
        </label>
        <select
          id="set-filter"
          value={setId}
          onChange={(e) => {
            setSetId(e.target.value)
            setPage(1)
          }}
        >
          <option value="">全部卡片集</option>
          {sets.data?.items
            .filter((s) => !categoryId || s.category_id === categoryId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
        <label className="sr-only" htmlFor="rarity-filter">
          稀有度
        </label>
        <select
          id="rarity-filter"
          value={rarity}
          onChange={(e) => {
            setRarity(e.target.value)
            setPage(1)
          }}
        >
          <option value="">全部稀有度</option>
          {Object.entries(rarityNames).map(([key, name]) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </select>
        <button
          className={`owned-toggle ${owned ? 'selected' : ''}`}
          aria-pressed={owned}
          onClick={() => {
            setOwned(!owned)
            setPage(1)
          }}
        >
          <Check size={16} />
          只看已收藏
        </button>
      </div>
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState
          error={query.error}
          retry={() => {
            void query.refetch()
          }}
        />
      ) : (
        <>
          {query.data.items.length ? (
            <div className="card-grid">
              {query.data.items.map((card) => (
                <button
                  className={`collection-card ${card.quantity ? 'collected' : 'uncollected'}`}
                  key={card.id}
                  onClick={() => setDetail(card.id)}
                >
                  <div className="card-art">
                    {card.quantity ? (
                      <img src={card.image_url} alt={card.name} loading="lazy" />
                    ) : (
                      <div className="card-silhouette">
                        <Leaf size={55} strokeWidth={1} />
                        <span>等待点亮</span>
                      </div>
                    )}
                    {card.quantity > 1 && <span className="quantity-badge">×{card.quantity}</span>}
                  </div>
                  <span className={`rarity-tag rarity-${card.rarity}`}>
                    {rarityNames[card.rarity]}
                  </span>
                  <h3>{card.name}</h3>
                  <p>{card.set_name}</p>
                </button>
              ))}
            </div>
          ) : (
            <section className="panel">
              <Empty
                icon={<BookOpen size={42} />}
                title={owned ? '收藏小册等你来点亮' : '这个分类还没有卡片'}
              >
                <p>{owned ? '完成今日任务，领取第一张卡片。' : '换个分类看看吧。'}</p>
              </Empty>
            </section>
          )}
          <Pager page={page} total={query.data.total} onChange={setPage} />
        </>
      )}
      {detail && <CardDetailModal key={detail} id={detail} onClose={() => setDetail(null)} />}
    </>
  )
}
