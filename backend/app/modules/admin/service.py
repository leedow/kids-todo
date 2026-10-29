import uuid
from datetime import date, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.errors import AppError, missing
from app.db.models import Acquisition, ActivityDay, DailyReward, SessionAccount, User, UserDay
from app.modules.admin.schema import UserInput, UserPatch
from app.modules.auth.service import passwords, user_public
from app.modules.tasks.service import day_public


def create_user(db: Session, value: UserInput):
    if db.scalar(select(User.id).where(func.lower(User.username) == value.username.lower())):
        raise AppError("USERNAME_TAKEN", "这个用户名已经被使用", 409)
    user = User(
        username=value.username.lower(),
        display_name=value.display_name,
        password_hash=passwords.hash(value.password),
        avatar_key=value.avatar_key,
        role="child",
    )
    db.add(user)
    db.flush()
    return user_public(user)


def update_user(db: Session, user_id: uuid.UUID, value: UserPatch):
    user = db.scalar(select(User).where(User.id == user_id, User.role == "child").with_for_update())
    if not user:
        missing()
    data = value.model_dump(exclude_none=True)
    invalidate = "password" in data or ("status" in data and data["status"] != user.status)
    if "password" in data:
        user.password_hash = passwords.hash(data.pop("password"))
        user.failed_logins = 0
        user.locked_until = None
    for key, val in data.items():
        setattr(user, key, val)
    if invalidate:
        user.credential_version += 1
        db.execute(delete(SessionAccount).where(SessionAccount.user_id == user.id))
    db.flush()
    return user_public(user)


def validate_range(start: date, end: date, limit=31):
    if not 0 <= (end - start).days < limit or end > clock.today():
        raise AppError("INVALID_DATE_RANGE", f"请选择截至今天的1至{limit}天", 422)


def stats(db: Session, start: date, end: date):
    validate_range(start, end)
    children = list(db.scalars(select(User).where(User.role == "child")))
    days = []
    for offset in range((end - start).days + 1):
        on_date = start + timedelta(days=offset)
        totals = [day_public(db, user.id, on_date)["progress"] for user in children]
        total = sum(t["total"] for t in totals)
        completed = sum(t["completed"] for t in totals)
        active = db.scalar(
            select(func.count()).select_from(ActivityDay).where(ActivityDay.business_date == on_date)
        )
        earned = db.scalar(
            select(func.count())
            .select_from(DailyReward)
            .join(UserDay)
            .where(UserDay.business_date == on_date)
        )
        acquired = db.scalar(
            select(func.count())
            .select_from(Acquisition)
            .where(func.date(func.timezone("Asia/Shanghai", Acquisition.acquired_at)) == on_date)
        )
        days.append(
            {
                "date": on_date,
                "active_users": active,
                "total_tasks": total,
                "completed_tasks": completed,
                "completion_rate": completed / total if total else None,
                "rewards_earned": earned,
                "draws_completed": acquired,
                "cards_granted": acquired,
            }
        )
    return {
        "total_users": len(children),
        "disabled_users": sum(u.status == "disabled" for u in children),
        "days": days,
    }
