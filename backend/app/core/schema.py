from datetime import date, datetime, time
from typing import Generic, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class UserPublic(BaseModel):
    id: UUID
    username: str
    display_name: str
    avatar_key: str
    role: Literal["admin", "child"]
    status: Literal["active", "disabled"]


class AccountsPublic(BaseModel):
    accounts: list[UserPublic]


class MePublic(BaseModel):
    user: UserPublic
    server_today: date
    timezone: str


class TaskPublic(BaseModel):
    id: UUID
    version_id: UUID
    version_no: int
    name: str
    description: str
    icon: str
    color: str
    sort_order: int
    state: Literal["active", "paused", "archived"]
    rule_type: Literal["once", "daily", "weekly"]
    start_date: date
    end_date: date | None
    planned_time: time | None
    weekdays: list[int]


class TaskInstancePublic(TaskPublic):
    instance_id: UUID | None
    completed_at: datetime | None
    planned_time_passed: bool = False


class ProgressPublic(BaseModel):
    total: int
    completed: int


class RewardPublic(BaseModel):
    id: UUID | None
    state: Literal["locked", "available", "drawing", "claimed"]
    earned_at: datetime | None


class DayPublic(BaseModel):
    business_date: date
    server_today: date
    timezone: str
    is_preview: bool
    prepared: bool
    tasks: list[TaskInstancePublic]
    progress: ProgressPublic
    reward: RewardPublic


class TaskSaved(BaseModel):
    task: TaskPublic
    day: DayPublic


class RewardItem(BaseModel):
    id: UUID
    business_date: date
    state: Literal["available", "drawing", "claimed"]
    earned_at: datetime


class CardPublic(BaseModel):
    id: UUID
    name: str
    description: str
    set_id: UUID
    set_name: str
    category_id: UUID
    category_name: str
    image_asset_id: UUID
    image_url: str
    rarity: Literal["common", "rare", "epic", "legendary"]
    draw_weight: int
    sort_order: int
    status: Literal["active", "archived"]


class OwnedCard(CardPublic):
    quantity: int
    first_acquired_at: datetime | None
    last_acquired_at: datetime | None


class DrawOptionPublic(BaseModel):
    id: UUID
    position: int
    card: CardPublic


class DrawPublic(BaseModel):
    id: UUID
    reward_id: UUID
    state: Literal["open", "claimed"]
    options: list[DrawOptionPublic]
    selected_option_id: UUID | None


class AcquisitionPublic(BaseModel):
    id: UUID
    session_id: UUID
    option_id: UUID
    card: CardPublic
    acquired_at: datetime
    quantity: int
