import uuid

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import select

from app.core.dependencies import DB, Child
from app.core.schema import AcquisitionPublic, DrawPublic, Page, RewardItem
from app.db.models import DailyReward, UserDay
from app.modules.rewards import service

router = APIRouter()


class SelectionInput(BaseModel):
    option_id: uuid.UUID


@router.get("/me/rewards", response_model=Page[RewardItem])
def rewards(
    user: Child,
    db: DB,
    state: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    query = select(DailyReward, UserDay.business_date).join(UserDay).where(DailyReward.user_id == user.id)
    if state == "pending":
        query = query.where(DailyReward.state != "claimed")
    elif state:
        query = query.where(DailyReward.state == state)
    rows = list(db.execute(query.order_by(UserDay.business_date.desc())))
    return {
        "items": [
            {"id": str(r.id), "business_date": d, "state": r.state, "earned_at": r.earned_at}
            for r, d in rows[(page - 1) * page_size : page * page_size]
        ],
        "total": len(rows),
        "page": page,
        "page_size": page_size,
    }


@router.post("/me/rewards/{reward_id}/draw-session", response_model=DrawPublic)
def open_draw(reward_id: uuid.UUID, user: Child, db: DB):
    return service.open_draw(db, user.id, reward_id)


@router.put("/me/draw-sessions/{session_id}/selection", response_model=AcquisitionPublic)
def select_card(session_id: uuid.UUID, payload: SelectionInput, user: Child, db: DB):
    return service.select_card(db, user.id, session_id, payload.option_id)
