import { useQuery } from '@tanstack/react-query'
import { BookOpen, ChevronDown, Layers3, SlidersHorizontal } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api/client'
import type { CardDetail, CardSet, OwnedCard, Page } from '../api/types'
import { useAccounts } from '../app/context'
import { rarityNames } from '../components/icons'
import { CardViewer } from '../components/card-viewer'
import { Empty, ErrorState, Loading, Pager } from '../components/ui'
import '../styles/collection-workspace.css'

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
  const [rarity, setRarity] = useState('')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<string | null>(null)
  const sets = useQuery({
    queryKey: ['child', activeId, 'collection-sets'],
    queryFn: ({ signal }) =>
      api<{ items: CardSet[] }>('/me/collection/sets', { accountId: activeId, signal }),
  })
  const query = useQuery({
    queryKey: ['child', activeId, 'collection', setId, rarity, 'owned', page],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ page: String(page), owned_only: 'true' })
      if (setId) params.set('set_id', setId)
      if (rarity) params.set('rarity', rarity)
      return api<Page<OwnedCard>>(`/me/collection?${params}`, { accountId: activeId, signal })
    },
  })
  const selectSet = (id: string) => {
    setSetId(id)
    setPage(1)
  }
  const filtered = !!setId || !!rarity

  return (
    <section className="collection-page" aria-label="卡片图鉴">
      <div className="collection-workspace">
        <aside className="collection-sidebar" aria-label="卡片集">
          <h2>
            <Layers3 size={16} aria-hidden="true" />
            卡片集
          </h2>
          <nav className="collection-sets" aria-label="选择卡片集">
            <button className="collection-set" aria-pressed={!setId} onClick={() => selectSet('')}>
              <Layers3 size={18} aria-hidden="true" />
              <span className="collection-set-name">全部卡片</span>
            </button>
            {sets.data?.items.map((set) => (
              <button
                key={set.id}
                className="collection-set"
                aria-pressed={setId === set.id}
                onClick={() => selectSet(set.id)}
              >
                <BookOpen size={18} aria-hidden="true" />
                <span className="collection-set-name">{set.name}</span>
                <span className="collection-set-count">{set.owned_unique ?? 0}</span>
              </button>
            ))}
          </nav>
          {sets.isPending && <Loading label="正在加载卡集…" />}
          {sets.error && <ErrorState error={sets.error} retry={() => void sets.refetch()} />}
        </aside>
        <div className="collection-gallery">
          <div className="collection-toolbar">
            <div className="collection-selection">
              <h2>{sets.data?.items.find((set) => set.id === setId)?.name ?? '全部卡片'}</h2>
              {query.data && <span>{query.data.total} 张</span>}
            </div>
            <div className="collection-rarity">
              <label htmlFor="rarity-filter">
                <SlidersHorizontal size={15} aria-hidden="true" />
                稀有度
              </label>
              <div className="collection-select">
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
                <ChevronDown size={14} aria-hidden="true" />
              </div>
            </div>
          </div>
          {query.isPending ? (
            <Loading />
          ) : query.error ? (
            <ErrorState error={query.error} retry={() => void query.refetch()} />
          ) : (
            <>
              {query.data.items.length ? (
                <div className="card-grid" aria-label="已获得的卡片">
                  {query.data.items.map((card) => (
                    <button
                      className="collection-card"
                      key={card.id}
                      aria-label={`查看${card.name}`}
                      onClick={() => setDetail(card.id)}
                    >
                      <img src={card.image_url} alt={card.name} loading="lazy" />
                    </button>
                  ))}
                </div>
              ) : (
                <section className="panel">
                  <Empty
                    icon={<BookOpen size={42} />}
                    title={filtered ? '还没有符合条件的卡片' : '收藏小册等你来点亮'}
                  >
                    <p>
                      {filtered ? '换个卡集或稀有度看看吧。' : '完成今日任务，领取第一张卡片。'}
                    </p>
                    {filtered && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          selectSet('')
                          setRarity('')
                        }}
                      >
                        查看全部卡片
                      </button>
                    )}
                  </Empty>
                </section>
              )}
              <Pager
                page={page}
                total={query.data.total}
                pageSize={query.data.page_size}
                onChange={setPage}
              />
            </>
          )}
        </div>
      </div>
      {detail && <CardDetailModal key={detail} id={detail} onClose={() => setDetail(null)} />}
    </section>
  )
}
