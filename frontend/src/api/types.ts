import type { components } from './generated'

export type User = components['schemas']['UserPublic']
export type Task = components['schemas']['TaskPublic']
export type TaskInput = components['schemas']['TaskInput']
export type Day = components['schemas']['DayPublic']
export type Me = components['schemas']['MePublic']
export type Reward = components['schemas']['RewardItem']
export type Card = components['schemas']['CardPublic']
export type OwnedCard = components['schemas']['OwnedCard']
export type Draw = components['schemas']['DrawPublic']
export type Acquisition = components['schemas']['AcquisitionPublic']
export type UserInput = components['schemas']['UserInput']
export type CardInput = components['schemas']['CardInput']
export type CardSetInput = components['schemas']['SetInput']
export type CategoryInput = components['schemas']['CategoryInput']
export type Page<T> = { items: T[]; total: number; page: number; page_size: number }
export type CardCategory = {
  id: string
  name: string
  status: string
  sort_order: number
  sets?: CardSet[]
}
export type CardSet = {
  id: string
  name: string
  category_id: string
  description: string
  status: string
  sort_order: number
  cover_asset_id: string | null
  cover_url: string | null
  owned_unique?: number
  total?: number
}
export type CardDetail = OwnedCard & {
  acquisitions: { id: string; acquired_at: string; snapshot: Card }[]
}
export type CalendarDay = Pick<Day, 'business_date' | 'progress' | 'reward' | 'is_preview'>
export type StatsDay = {
  date: string
  active_users: number
  total_tasks: number
  completed_tasks: number
  completion_rate: number | null
  rewards_earned: number
  draws_completed: number
  cards_granted: number
}
export type Stats = { total_users: number; disabled_users: number; days: StatsDay[] }
export type AdminDraw = Draw & { user: User; business_date: string; completed_at: string | null }
