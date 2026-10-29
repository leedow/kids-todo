import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Gift, WandSparkles } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { Page, Reward } from '../api/types'
import { dateLabel, useAccounts } from '../app/context'
import { Button, Empty, ErrorState, Loading, Pager } from '../components/ui'
import { DrawModal } from '../components/draw-experience'

export function RewardsPage() {
  const { activeId } = useAccounts()
  const [page, setPage] = useState(1)
  const [rewardId, setRewardId] = useState<string | null>(null)
  const [previewing, setPreviewing] = useState(false)
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
      {import.meta.env.DEV && (
        <aside className="draw-preview-launch">
          <div>
            <strong>抽卡动效试映</strong>
            <p>可反复体验，不消耗奖励，不增加收藏。仅开发环境可见。</p>
          </div>
          <Button variant="secondary" onClick={() => setPreviewing(true)}>
            <WandSparkles size={17} />
            体验抽卡动效
          </Button>
        </aside>
      )}
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
      {(rewardId || previewing) && (
        <DrawModal
          key={previewing ? 'preview' : rewardId!}
          rewardId={rewardId ?? 'preview'}
          preview={previewing}
          onClose={() => {
            setRewardId(null)
            setPreviewing(false)
          }}
        />
      )}
    </>
  )
}
