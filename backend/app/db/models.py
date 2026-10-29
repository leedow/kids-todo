import uuid
from datetime import date, datetime, time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    Time,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class Entity:
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class User(Entity, Base):
    __tablename__ = "users"
    username: Mapped[str] = mapped_column(String(40))
    password_hash: Mapped[str] = mapped_column(Text)
    display_name: Mapped[str] = mapped_column(String(40))
    avatar_key: Mapped[str] = mapped_column(String(30), default="fox")
    role: Mapped[str] = mapped_column(String(10), default="child")
    status: Mapped[str] = mapped_column(String(10), default="active")
    credential_version: Mapped[int] = mapped_column(Integer, default=1)
    failed_logins: Mapped[int] = mapped_column(Integer, default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        Index("uq_users_username_lower", func.lower(username), unique=True),
        CheckConstraint("role IN ('admin','child')"),
        CheckConstraint("status IN ('active','disabled')"),
    )


class AuthSession(Entity, Base):
    __tablename__ = "auth_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    csrf_hash: Mapped[str] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(10))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (CheckConstraint("kind IN ('admin','child')"),)


class SessionAccount(Base):
    __tablename__ = "session_accounts"
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("auth_sessions.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True, index=True)
    credential_version: Mapped[int] = mapped_column(Integer)
    authenticated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Task(Entity, Base):
    __tablename__ = "tasks"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    __table_args__ = (UniqueConstraint("id", "user_id"),)


class TaskVersion(Entity, Base):
    __tablename__ = "task_versions"
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id"), index=True)
    version_no: Mapped[int] = mapped_column(Integer)
    effective_date: Mapped[date] = mapped_column(Date)
    name: Mapped[str] = mapped_column(String(60))
    description: Mapped[str] = mapped_column(String(500), default="")
    icon: Mapped[str] = mapped_column(String(30), default="star")
    color: Mapped[str] = mapped_column(String(20), default="mint")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    state: Mapped[str] = mapped_column(String(10), default="active")
    rule_type: Mapped[str] = mapped_column(String(10))
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    planned_time: Mapped[time | None] = mapped_column(Time)
    weekdays: Mapped[list[int]] = mapped_column(JSONB, default=list)
    __table_args__ = (
        UniqueConstraint("task_id", "version_no"),
        UniqueConstraint("id", "task_id"),
        Index("ix_task_versions_effective", "task_id", "effective_date", "version_no"),
        CheckConstraint("state IN ('active','paused','archived')"),
        CheckConstraint("rule_type IN ('once','daily','weekly')"),
        CheckConstraint("end_date IS NULL OR end_date >= start_date"),
    )


class UserDay(Entity, Base):
    __tablename__ = "user_days"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    business_date: Mapped[date] = mapped_column(Date, index=True)
    prepared_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revision: Mapped[int] = mapped_column(Integer, default=1)
    __table_args__ = (UniqueConstraint("user_id", "business_date"), UniqueConstraint("id", "user_id"))


class TaskInstance(Entity, Base):
    __tablename__ = "task_instances"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    day_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    task_id: Mapped[uuid.UUID] = mapped_column(Uuid, index=True)
    task_version_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    is_included: Mapped[bool] = mapped_column(Boolean, default=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        UniqueConstraint("day_id", "task_id"),
        ForeignKeyConstraint(["task_id", "user_id"], ["tasks.id", "tasks.user_id"]),
        ForeignKeyConstraint(["day_id", "user_id"], ["user_days.id", "user_days.user_id"]),
        ForeignKeyConstraint(["task_version_id", "task_id"], ["task_versions.id", "task_versions.task_id"]),
    )


class DailyReward(Entity, Base):
    __tablename__ = "daily_rewards"
    day_id: Mapped[uuid.UUID] = mapped_column(Uuid, unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    state: Mapped[str] = mapped_column(String(12), default="available")
    earned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    evidence: Mapped[dict] = mapped_column(JSONB)
    __table_args__ = (
        ForeignKeyConstraint(["day_id", "user_id"], ["user_days.id", "user_days.user_id"]),
        UniqueConstraint("id", "user_id"),
        CheckConstraint("state IN ('available','drawing','claimed')"),
    )


class MediaAsset(Entity, Base):
    __tablename__ = "media_assets"
    storage_key: Mapped[str] = mapped_column(String(200), unique=True)
    mime_type: Mapped[str] = mapped_column(String(50))
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    size_bytes: Mapped[int] = mapped_column(Integer)


class CardCategory(Entity, Base):
    __tablename__ = "card_categories"
    name: Mapped[str] = mapped_column(String(60))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(10), default="active")
    __table_args__ = (CheckConstraint("status IN ('active','archived')"),)


class CardSet(Entity, Base):
    __tablename__ = "card_sets"
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("card_categories.id"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    description: Mapped[str] = mapped_column(String(1000), default="")
    cover_asset_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("media_assets.id"), index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(10), default="active")
    __table_args__ = (CheckConstraint("status IN ('active','archived')"),)


class Card(Entity, Base):
    __tablename__ = "cards"
    set_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("card_sets.id"), index=True)
    name: Mapped[str] = mapped_column(String(60))
    description: Mapped[str] = mapped_column(String(1000), default="")
    image_asset_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("media_assets.id"), index=True)
    rarity: Mapped[str] = mapped_column(String(12), default="common")
    draw_weight: Mapped[int] = mapped_column(Integer, default=10)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(10), default="active")
    __table_args__ = (
        CheckConstraint("rarity IN ('common','rare','epic','legendary')"),
        CheckConstraint("draw_weight BETWEEN 1 AND 10000"),
        CheckConstraint("status IN ('active','archived')"),
        Index("ix_cards_pool", "status", "set_id"),
    )


class DrawSession(Entity, Base):
    __tablename__ = "card_draw_sessions"
    reward_id: Mapped[uuid.UUID] = mapped_column(Uuid, unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    state: Mapped[str] = mapped_column(String(10), default="open")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    __table_args__ = (
        ForeignKeyConstraint(["reward_id", "user_id"], ["daily_rewards.id", "daily_rewards.user_id"]),
        UniqueConstraint("id", "user_id"),
        CheckConstraint("state IN ('open','claimed')"),
    )


class DrawOption(Entity, Base):
    __tablename__ = "card_draw_options"
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("card_draw_sessions.id"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    card_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cards.id"), index=True)
    snapshot: Mapped[dict] = mapped_column(JSONB)
    __table_args__ = (
        UniqueConstraint("session_id", "position"),
        UniqueConstraint("session_id", "card_id"),
        UniqueConstraint("id", "session_id", "card_id"),
        CheckConstraint("position BETWEEN 1 AND 3"),
    )


class Acquisition(Entity, Base):
    __tablename__ = "card_acquisition_records"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    session_id: Mapped[uuid.UUID] = mapped_column(Uuid, unique=True)
    option_id: Mapped[uuid.UUID] = mapped_column(Uuid)
    card_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cards.id"), index=True)
    acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    snapshot: Mapped[dict] = mapped_column(JSONB)
    __table_args__ = (
        ForeignKeyConstraint(
            ["session_id", "user_id"], ["card_draw_sessions.id", "card_draw_sessions.user_id"]
        ),
        ForeignKeyConstraint(
            ["option_id", "session_id", "card_id"],
            ["card_draw_options.id", "card_draw_options.session_id", "card_draw_options.card_id"],
        ),
    )


class UserCard(Base):
    __tablename__ = "user_cards"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    card_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("cards.id"), primary_key=True, index=True)
    quantity: Mapped[int] = mapped_column(Integer)
    first_acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_acquired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    __table_args__ = (CheckConstraint("quantity > 0"),)


class ActivityDay(Base):
    __tablename__ = "user_activity_days"
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), primary_key=True)
    business_date: Mapped[date] = mapped_column(Date, primary_key=True)
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
