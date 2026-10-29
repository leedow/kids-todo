import uuid
from datetime import date
from typing import Any, Literal

from fastapi import APIRouter, Query, UploadFile
from sqlalchemy import func, select

from app.core.dependencies import DB, Admin
from app.core.errors import AppError, missing
from app.core.schema import CardPublic, Page, UserPublic
from app.db.models import DrawSession, User
from app.modules.admin import service
from app.modules.admin.schema import UserInput, UserPatch
from app.modules.auth.service import user_public
from app.modules.cards import service as cards
from app.modules.cards.schema import CardInput, CategoryInput, SetInput
from app.modules.rewards.service import draw_public
from app.modules.tasks.service import day_public

router = APIRouter(prefix="/admin")
Kind = Literal["card-categories", "card-sets", "cards"]


@router.get("/me")
def me(admin: Admin):
    from app.core import clock

    return {"user": user_public(admin), "server_today": clock.today(), "timezone": "Asia/Shanghai"}


@router.get("/users", response_model=Page[UserPublic])
def users(
    admin: Admin,
    db: DB,
    q: str = "",
    status: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    query = select(User).where(User.role == "child")
    if q:
        query = query.where(User.username.ilike(f"%{q}%") | User.display_name.ilike(f"%{q}%"))
    if status:
        query = query.where(User.status == status)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size))
    return {"items": [user_public(u) for u in rows], "total": total, "page": page, "page_size": page_size}


@router.post("/users", status_code=201, response_model=UserPublic)
def create_user(payload: UserInput, admin: Admin, db: DB):
    return service.create_user(db, payload)


@router.get("/users/{user_id}", response_model=UserPublic)
def user_detail(user_id: uuid.UUID, admin: Admin, db: DB):
    user = db.get(User, user_id)
    if not user or user.role != "child":
        missing()
    return user_public(user)


@router.patch("/users/{user_id}", response_model=UserPublic)
def update_user(user_id: uuid.UUID, payload: UserPatch, admin: Admin, db: DB):
    return service.update_user(db, user_id, payload)


@router.get("/users/{user_id}/days")
def user_days(
    user_id: uuid.UUID, admin: Admin, db: DB, start: date = Query(alias="from"), end: date = Query(alias="to")
):
    from datetime import timedelta

    service.validate_range(start, end)
    user = db.get(User, user_id)
    if not user or user.role != "child":
        missing()
    return {
        "days": [
            day_public(db, user_id, start + timedelta(days=offset))
            for offset in range((end - start).days + 1)
        ]
    }


@router.get("/users/{user_id}/collection")
def user_collection(
    user_id: uuid.UUID,
    admin: Admin,
    db: DB,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    return cards.collection(db, user_id, owned_only=True, page=page, page_size=page_size)


@router.get("/stats")
def stats(admin: Admin, db: DB, start: date = Query(alias="from"), end: date = Query(alias="to")):
    return service.stats(db, start, end)


@router.get("/draw-sessions")
def draws(
    admin: Admin,
    db: DB,
    user_id: uuid.UUID | None = None,
    state: str | None = None,
    start: date | None = Query(None, alias="from"),
    end: date | None = Query(None, alias="to"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    from app.db.models import DailyReward, UserDay

    query = select(DrawSession).join(DailyReward).join(UserDay)
    if user_id:
        query = query.where(DrawSession.user_id == user_id)
    if state:
        query = query.where(DrawSession.state == state)
    if start:
        query = query.where(UserDay.business_date >= start)
    if end:
        query = query.where(UserDay.business_date <= end)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    sessions = db.scalars(
        query.order_by(DrawSession.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    return {
        "items": [
            {
                **draw_public(db, s),
                "user": user_public(db.get(User, s.user_id)),
                "business_date": db.get(UserDay, db.get(DailyReward, s.reward_id).day_id).business_date,
                "completed_at": s.completed_at,
            }
            for s in sessions
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/media", status_code=201)
def upload(file: UploadFile, admin: Admin, db: DB):
    if file.content_type not in {"image/jpeg", "image/png", "image/webp"}:
        raise AppError("INVALID_IMAGE", "只支持JPEG、PNG或WebP图片", 422)
    return cards.upload_image(db, file.file.read(5 * 1024 * 1024 + 1))


@router.post("/cards", status_code=201, response_model=CardPublic)
def card_create(payload: CardInput, admin: Admin, db: DB):
    return cards.save_content(db, "cards", payload.model_dump())


@router.post("/card-categories", status_code=201)
def category_create(payload: CategoryInput, admin: Admin, db: DB):
    return cards.save_content(db, "card-categories", payload.model_dump())


@router.post("/card-sets", status_code=201)
def set_create(payload: SetInput, admin: Admin, db: DB):
    return cards.save_content(db, "card-sets", payload.model_dump())


@router.get("/{kind}")
def content_list(
    kind: Kind,
    admin: Admin,
    db: DB,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: str = "",
    status: str | None = None,
):
    model, _ = cards.content_type(kind)
    query = select(model)
    if q:
        query = query.where(model.name.ilike(f"%{q}%"))
    if status:
        query = query.where(model.status == status)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    rows = db.scalars(
        query.order_by(model.sort_order, model.created_at).offset((page - 1) * page_size).limit(page_size)
    )
    return {
        "items": [cards.content_public(db, r) for r in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/{kind}", status_code=201)
def content_create(kind: Kind, payload: dict[str, Any], admin: Admin, db: DB):
    return cards.save_content(db, kind, payload)


@router.get("/{kind}/{item_id}")
def content_detail(kind: Kind, item_id: uuid.UUID, admin: Admin, db: DB):
    model, _ = cards.content_type(kind)
    item = db.get(model, item_id)
    if not item:
        missing()
    return cards.content_public(db, item)


@router.patch("/{kind}/{item_id}")
def content_update(kind: Kind, item_id: uuid.UUID, payload: dict[str, Any], admin: Admin, db: DB):
    return cards.save_content(db, kind, payload, item_id)


@router.delete("/{kind}/{item_id}", status_code=204)
def content_archive(kind: Kind, item_id: uuid.UUID, admin: Admin, db: DB):
    cards.save_content(db, kind, {"status": "archived"}, item_id)
