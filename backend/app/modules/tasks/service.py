import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import clock
from app.core.errors import AppError, missing
from app.db.models import DailyReward, Task, TaskInstance, TaskVersion, User, UserDay
from app.modules.tasks.schema import TaskInput

VERSION_FIELDS = tuple(TaskInput.model_fields)


def lock_child(db: Session, user_id: uuid.UUID) -> User:
    user = db.scalar(
        select(User).where(User.id == user_id).with_for_update().execution_options(populate_existing=True)
    )
    if not user or user.status != "active":
        raise AppError("UNAUTHENTICATED", "账号已停用", 401)
    return user


def latest_versions(db: Session, user_id: uuid.UUID, on_date: date) -> list[TaskVersion]:
    # PostgreSQL DISTINCT ON chooses the last effective version, including multiple
    # edits on the same day. Archived versions must not be filtered before selection.
    return list(
        db.scalars(
            select(TaskVersion)
            .join(Task, Task.id == TaskVersion.task_id)
            .where(Task.user_id == user_id, TaskVersion.effective_date <= on_date)
            .distinct(TaskVersion.task_id)
            .order_by(TaskVersion.task_id, TaskVersion.effective_date.desc(), TaskVersion.version_no.desc())
        )
    )


def applies(version: TaskVersion, on_date: date) -> bool:
    if version.state != "active" or on_date < version.start_date:
        return False
    if version.end_date and on_date > version.end_date:
        return False
    if version.rule_type == "once":
        return on_date == version.start_date
    return version.rule_type == "daily" or on_date.isoweekday() in version.weekdays


def version_public(v: TaskVersion) -> dict:
    return {
        "id": str(v.task_id),
        "version_id": str(v.id),
        "version_no": v.version_no,
        **{field: getattr(v, field) for field in VERSION_FIELDS},
    }


def find_day(db: Session, user_id: uuid.UUID, on_date: date) -> UserDay | None:
    return db.scalar(select(UserDay).where(UserDay.user_id == user_id, UserDay.business_date == on_date))


def prepare_day(db: Session, user_id: uuid.UUID, on_date: date, sync_today=False) -> UserDay:
    if on_date > clock.today():
        raise AppError("FUTURE_PREVIEW_ONLY", "未来日期仅提供预览", 409)
    day = find_day(db, user_id, on_date)
    if day and not (sync_today and on_date == clock.today()):
        return day
    if not day:
        day = UserDay(user_id=user_id, business_date=on_date, prepared_at=clock.now())
        db.add(day)
        db.flush()
    existing = {i.task_id: i for i in db.scalars(select(TaskInstance).where(TaskInstance.day_id == day.id))}
    for v in latest_versions(db, user_id, on_date):
        instance = existing.get(v.task_id)
        included = applies(v, on_date)
        if instance:
            instance.is_included = included
            instance.task_version_id = v.id
        elif included:
            db.add(
                TaskInstance(
                    user_id=user_id, day_id=day.id, task_id=v.task_id, task_version_id=v.id, is_included=True
                )
            )
    day.revision += 1
    db.flush()
    return day


def reward_public(reward: DailyReward | None) -> dict:
    return (
        {"state": reward.state, "id": str(reward.id), "earned_at": reward.earned_at}
        if reward
        else {"state": "locked", "id": None, "earned_at": None}
    )


def day_public(db: Session, user_id: uuid.UUID, on_date: date) -> dict:
    day = find_day(db, user_id, on_date)
    tasks = []
    if day:
        for i, v in db.execute(
            select(TaskInstance, TaskVersion)
            .join(TaskVersion, TaskVersion.id == TaskInstance.task_version_id)
            .where(TaskInstance.day_id == day.id, TaskInstance.is_included.is_(True))
        ):
            tasks.append({**version_public(v), "instance_id": str(i.id), "completed_at": i.completed_at})
    else:
        tasks = [
            {**version_public(v), "instance_id": None, "completed_at": None}
            for v in latest_versions(db, user_id, on_date)
            if applies(v, on_date)
        ]
    local_time = clock.now().astimezone(clock.TZ).time().replace(tzinfo=None)
    for task in tasks:
        task["planned_time_passed"] = bool(
            not task["completed_at"]
            and task["planned_time"]
            and (on_date < clock.today() or (on_date == clock.today() and task["planned_time"] < local_time))
        )
    tasks.sort(key=lambda t: (t["planned_time"] is None, t["planned_time"] or "", t["sort_order"], t["name"]))
    reward = db.scalar(select(DailyReward).where(DailyReward.day_id == day.id)) if day else None
    return {
        "business_date": on_date,
        "server_today": clock.today(),
        "timezone": "Asia/Shanghai",
        "is_preview": on_date > clock.today(),
        "prepared": day is not None,
        "tasks": tasks,
        "progress": {"total": len(tasks), "completed": sum(t["completed_at"] is not None for t in tasks)},
        "reward": reward_public(reward),
    }


def grant_if_complete(db: Session, day: UserDay) -> DailyReward | None:
    existing = db.scalar(select(DailyReward).where(DailyReward.day_id == day.id))
    if existing or day.business_date != clock.today():
        return existing
    rows = list(
        db.execute(
            select(TaskInstance, TaskVersion)
            .join(TaskVersion, TaskVersion.id == TaskInstance.task_version_id)
            .where(TaskInstance.day_id == day.id, TaskInstance.is_included.is_(True))
        )
    )
    if not rows or any(i.completed_at is None for i, _ in rows):
        return None
    reward = DailyReward(
        day_id=day.id,
        user_id=day.user_id,
        earned_at=clock.now(),
        state="available",
        evidence={
            "total": len(rows),
            "tasks": [
                {
                    "instance_id": str(i.id),
                    "version_id": str(v.id),
                    "name": v.name,
                    "completed_at": i.completed_at.isoformat(),
                }
                for i, v in rows
            ],
        },
    )
    db.add(reward)
    db.flush()
    return reward


def save_task(db: Session, user_id: uuid.UUID, payload: dict, task_id: uuid.UUID | None = None) -> dict:
    lock_child(db, user_id)
    stamp_date = clock.today()
    day = prepare_day(db, user_id, stamp_date)
    if task_id:
        task = db.scalar(select(Task).where(Task.id == task_id, Task.user_id == user_id))
        if not task:
            missing()
        old = db.scalar(
            select(TaskVersion)
            .where(TaskVersion.task_id == task.id)
            .order_by(TaskVersion.version_no.desc())
            .limit(1)
        )
        if old.state == "archived":
            raise AppError("TASK_ARCHIVED", "归档任务不能再修改", 409)
        data = {key: getattr(old, key) for key in VERSION_FIELDS}
        data.update(payload)
        value = TaskInput.model_validate(data)
        if value.start_date != old.start_date and value.start_date < stamp_date:
            raise AppError("INVALID_START_DATE", "不能将任务开始日期改到过去", 422)
        version_no = old.version_no + 1
    else:
        value = TaskInput.model_validate(payload)
        if value.start_date < stamp_date:
            raise AppError("INVALID_START_DATE", "不能创建过去的任务", 422)
        task = Task(user_id=user_id)
        db.add(task)
        db.flush()
        version_no = 1
    version = TaskVersion(
        task_id=task.id, version_no=version_no, effective_date=stamp_date, **value.model_dump()
    )
    db.add(version)
    db.flush()
    prepare_day(db, user_id, stamp_date, sync_today=True)
    grant_if_complete(db, day)
    return {"task": version_public(version), "day": day_public(db, user_id, stamp_date)}


def archive_task(db: Session, user_id: uuid.UUID, task_id: uuid.UUID):
    lock_child(db, user_id)
    task = db.scalar(select(Task).where(Task.id == task_id, Task.user_id == user_id))
    if not task:
        missing()
    current = db.scalar(
        select(TaskVersion)
        .where(TaskVersion.task_id == task.id)
        .order_by(TaskVersion.version_no.desc())
        .limit(1)
    )
    if current.state != "archived":
        save_task(db, user_id, {"state": "archived"}, task_id)


def complete(db: Session, user_id: uuid.UUID, instance_id: uuid.UUID, completed: bool) -> dict:
    lock_child(db, user_id)
    instance = db.scalar(
        select(TaskInstance).where(TaskInstance.id == instance_id, TaskInstance.user_id == user_id)
    )
    if not instance:
        missing()
    day = db.get(UserDay, instance.day_id)
    # Evaluate after acquiring the account lock, including requests that cross midnight.
    if day.business_date != clock.today():
        raise AppError("DAY_CLOSED", "只能修改今天的任务记录", 409)
    if not instance.is_included:
        raise AppError("TASK_NOT_INCLUDED", "这项任务已不在今日计划中", 409)
    if completed and instance.completed_at is None:
        instance.completed_at = clock.now()
    elif not completed:
        instance.completed_at = None
    db.flush()
    grant_if_complete(db, day)
    return day_public(db, user_id, day.business_date)
