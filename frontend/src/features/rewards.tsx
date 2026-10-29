import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, Gift, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Acquisition, Draw, Page, Reward } from '../api/types'
import { dateLabel, useAccounts } from '../app/context'
import { rarityNames } from '../components/icons'
import { Button, Empty, ErrorState, Loading, Modal, Pager } from '../components/ui'

export function DrawModal({ rewardId, onClose }: { rewardId: string; onClose: () => void }) {
  const { activeId } = useAccounts()
  const client = useQueryClient()
  const [selected, setSelected] = useState<string | null>(null)
  const [received, setReceived] = useState<Acquisition | null>(null)
  const query = useQuery({
    queryKey: ['child', activeId, 'draw', rewardId],
    queryFn: ({ signal }) =>
      api<Draw>(`/me/rewards/${rewardId}/draw-session`, {
        method: 'POST',
        accountId: activeId,
        signal,
      }),
  })
  const choose = useMutation({
    mutationFn: () =>
      api<Acquisition>(`/me/draw-sessions/${query.data!.id}/selection`, {
        method: 'PUT',
        accountId: activeId,
        body: { option_id: selected },
      }),
    onSuccess: (data) => {
      setReceived(data)
      void client.invalidateQueries({ queryKey: ['child', activeId] })
    },
  })
  const claimed = query.data?.state === 'claimed'
  const chosenCard =
    received?.card ?? query.data?.options.find((o) => o.id === query.data?.selected_option_id)?.card
  return (
    <Modal
      open
      onClose={onClose}
      title={chosenCard ? '一份努力，一张新收藏' : '挑选今天的小惊喜'}
      description={
        chosenCard ? '这张卡片已经收入你的图鉴。' : '三张卡片中，哪一张让你好奇？选择后确认领取。'
      }
      wide
    >
      {query.isPending ? (
        <Loading label="正在准备你的三张卡片…" />
      ) : query.error ? (
        <ErrorState
          error={query.error}
          retry={() => {
            void query.refetch()
          }}
        />
      ) : chosenCard ? (
        <div className="received-card">
          <span className="tag">
            <Sparkles size={14} />
            已收入图鉴
          </span>
          <img src={chosenCard.image_url} alt={chosenCard.name} />
          <h2>{chosenCard.name}</h2>
          <p>{chosenCard.description}</p>
          <Button asChild onClick={onClose}>
            <Link to="/collection">
              看看我的收藏
              <ArrowRight size={17} />
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="draw-options">
            {query.data.options.map((option) => (
              <button
                key={option.id}
                className={`draw-option rarity-${option.card.rarity} ${selected === option.id ? 'selected' : ''}`}
                aria-pressed={selected === option.id}
                onClick={() => setSelected(option.id)}
                disabled={choose.isPending || claimed}
              >
                <img src={option.card.image_url} alt={option.card.name} />
                <span className={`rarity-tag rarity-${option.card.rarity}`}>
                  {rarityNames[option.card.rarity]}
                </span>
                <h3>{option.card.name}</h3>
                <p>{option.card.set_name}</p>
                {selected === option.id && (
                  <span className="selection-check">
                    <Check size={15} />
                  </span>
                )}
              </button>
            ))}
          </div>
          <p className="draw-description">
            {query.data.options.find((o) => o.id === selected)?.card.description ??
              '点击一张卡片，看看它的小知识。'}
          </p>
          {choose.error && (
            <p className="form-error" role="alert">
              {choose.error.message}
            </p>
          )}
          <Button
            className="draw-confirm"
            disabled={!selected || choose.isPending || claimed}
            onClick={() => choose.mutate()}
          >
            <Gift size={18} />
            {choose.isPending ? '正在收入图鉴…' : '确认选择这张卡片'}
          </Button>
          <p className="form-hint">奖励会为你保留，现在关闭也可以稍后继续。</p>
        </>
      )}
    </Modal>
  )
}

export function RewardsPage() {
  const { activeId } = useAccounts()
  const [page, setPage] = useState(1)
  const [rewardId, setRewardId] = useState<string | null>(null)
  const query = useQuery({
    queryKey: ['child', activeId, 'rewards', page],
    queryFn: ({ signal }) =>
      api<Page<Reward>>(`/me/rewards?state=pending&page=${page}`, { accountId: activeId, signal }),
  })
  return (
    <>
      <Link to="/" className="back-link">
        <ArrowLeft size={17} />
        返回今日
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">SAVED LITTLE SURPRISES</span>
          <h1>为你保留的小惊喜</h1>
          <p>每份努力都被记住，不用着急，慢慢挑选。</p>
        </div>
        <Gift className="heading-icon" size={48} />
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
        <section className="panel">
          {query.data.items.length ? (
            query.data.items.map((reward) => (
              <div className="reward-list-row" key={reward.id}>
                <span className="task-icon color-yellow">
                  <Gift />
                </span>
                <div>
                  <strong>{dateLabel(reward.business_date)}的成长奖励</strong>
                  <small>
                    {reward.state === 'drawing' ? '已经为你准备好三张卡片' : '当天的小目标全部完成'}
                  </small>
                </div>
                <Button onClick={() => setRewardId(reward.id)}>
                  挑选卡片
                  <ArrowRight size={16} />
                </Button>
              </div>
            ))
          ) : (
            <Empty icon={<Gift size={42} />} title="还没有待领取的奖励">
              <p>完成今天的小目标，就能收获一份小惊喜。</p>
              <Button asChild variant="secondary">
                <Link to="/">看看今日任务</Link>
              </Button>
            </Empty>
          )}
          <Pager page={page} total={query.data.total} onChange={setPage} />
        </section>
      )}
      {rewardId && (
        <DrawModal key={rewardId} rewardId={rewardId} onClose={() => setRewardId(null)} />
      )}
    </>
  )
}
