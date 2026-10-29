import uuid
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Query
from pydantic import BaseModel, ConfigDict

from app.core import clock
from app.core.dependencies import DB, Child
from app.core.errors import AppError
from app.core.schema import DayPublic, MePublic, Page, TaskPublic, TaskSaved
from app.modules.auth.service import user_public
from app.modules.tasks import service
from app.modules.tasks.schema import CompletionInput, TaskInput

router = APIRouter()


class TaskPatch(BaseModel):
    model_config = ConfigDict(extra="allow")


@router.get("/me", response_model=MePublic)
def me(user: Child):
    return {"user": user_public(user), "server_today": clock.today(), "timezone": "Asia/Shanghai"}


@router.get("/me/tasks", response_model=Page[TaskPublic])
def tasks(
    user: Child,
    db: DB,
    state: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    versions = service.latest_versions(db, user.id, clock.today())
    versions = sorted(
        [v for v in versions if v.state == state or (not state and v.state != "archived")],
        key=lambda v: (v.sort_order, v.name),
    )
    return {
        "items": [service.version_public(v) for v in versions[(page - 1) * page_size : page * page_size]],
        "total": len(versions),
        "page": page,
        "page_size": page_size,
    }


@router.post("/me/tasks", status_code=201, response_model=TaskSaved)
def create(payload: TaskInput, user: Child, db: DB):
    return service.save_task(db, user.id, payload.model_dump())


@router.patch("/me/tasks/{task_id}", response_model=TaskSaved)
def edit(task_id: uuid.UUID, payload: dict[str, Any], user: Child, db: DB):
    return service.save_task(db, user.id, payload, task_id)


@router.delete("/me/tasks/{task_id}", status_code=204)
def archive(task_id: uuid.UUID, user: Child, db: DB):
    service.archive_task(db, user.id, task_id)


@router.post("/me/days/{on_date}/prepare", response_model=DayPublic)
def prepare(on_date: date, user: Child, db: DB):
    service.lock_child(db, user.id)
    service.prepare_day(db, user.id, on_date)
    return service.day_public(db, user.id, on_date)


@router.get("/me/days/{on_date}", response_model=DayPublic)
def day(on_date: date, user: Child, db: DB):
    return service.day_public(db, user.id, on_date)


@router.put("/me/task-instances/{instance_id}/completion", response_model=DayPublic)
def complete(instance_id: uuid.UUID, payload: CompletionInput, user: Child, db: DB):
    return service.complete(db, user.id, instance_id, payload.completed)


@router.get("/me/calendar")
def calendar(user: Child, db: DB, start: date = Query(alias="from"), end: date = Query(alias="to")):
    if not 0 <= (end - start).days < 62:
        raise AppError("INVALID_DATE_RANGE", "日期范围应为1至62天", 422)
    result = []
    for offset in range((end - start).days + 1):
        day = service.day_public(db, user.id, start + timedelta(days=offset))
        result.append({k: day[k] for k in ("business_date", "progress", "reward", "is_preview")})
    return {"days": result}
