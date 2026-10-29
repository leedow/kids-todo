import secrets
import uuid

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core import clock
from app.core.errors import AppError, missing
from app.db.models import Acquisition, DailyReward, DrawOption, DrawSession, UserCard
from app.modules.cards.service import active_pool, card_public
from app.modules.tasks.service import lock_child


def draw_public(db: Session, session: DrawSession) -> dict:
    acquired = db.scalar(select(Acquisition).where(Acquisition.session_id == session.id))
    return {
        "id": str(session.id),
        "reward_id": str(session.reward_id),
        "state": session.state,
        "options": [
            {"id": str(o.id), "position": o.position, "card": o.snapshot}
            for o in db.scalars(
                select(DrawOption).where(DrawOption.session_id == session.id).order_by(DrawOption.position)
            )
        ],
        "selected_option_id": str(acquired.option_id) if acquired else None,
    }


def open_draw(db: Session, user_id: uuid.UUID, reward_id: uuid.UUID):
    lock_child(db, user_id)
    reward = db.scalar(select(DailyReward).where(DailyReward.id == reward_id, DailyReward.user_id == user_id))
    if not reward:
        missing()
    session = db.scalar(select(DrawSession).where(DrawSession.reward_id == reward.id))
    if session:
        return draw_public(db, session)
    pool = active_pool(db)
    if len(pool) < 3:
        raise AppError("CARD_POOL_UNAVAILABLE", "卡片正在准备中，奖励会为你保留，请稍后再来", 503)
    session = DrawSession(reward_id=reward.id, user_id=user_id, state="open")
    db.add(session)
    db.flush()
    for position in range(1, 4):
        value = secrets.randbelow(sum(card.draw_weight for card in pool))
        for index, card in enumerate(pool):
            value -= card.draw_weight
            if value < 0:
                chosen = pool.pop(index)
                break
        db.add(
            DrawOption(
                session_id=session.id, position=position, card_id=chosen.id, snapshot=card_public(db, chosen)
            )
        )
    reward.state = "drawing"
    db.flush()
    return draw_public(db, session)


def acquisition_public(db: Session, record: Acquisition):
    owned = db.get(UserCard, (record.user_id, record.card_id), populate_existing=True)
    return {
        "id": str(record.id),
        "session_id": str(record.session_id),
        "option_id": str(record.option_id),
        "card": record.snapshot,
        "acquired_at": record.acquired_at,
        "quantity": owned.quantity,
    }


def select_card(db: Session, user_id: uuid.UUID, session_id: uuid.UUID, option_id: uuid.UUID):
    lock_child(db, user_id)
    session = db.scalar(
        select(DrawSession).where(DrawSession.id == session_id, DrawSession.user_id == user_id)
    )
    if not session:
        missing()
    existing = db.scalar(select(Acquisition).where(Acquisition.session_id == session.id))
    if existing:
        if existing.option_id != option_id:
            raise AppError("ALREADY_SELECTED", "已经领取过这次奖励，不能改选", 409)
        return acquisition_public(db, existing)
    option = db.scalar(
        select(DrawOption).where(DrawOption.id == option_id, DrawOption.session_id == session.id)
    )
    if not option:
        raise AppError("INVALID_OPTION", "请选择本次奖励中的卡片", 422)
    stamp = clock.now()
    record = Acquisition(
        user_id=user_id,
        session_id=session.id,
        option_id=option.id,
        card_id=option.card_id,
        acquired_at=stamp,
        snapshot=option.snapshot,
    )
    db.add(record)
    db.flush()
    db.execute(
        insert(UserCard)
        .values(
            user_id=user_id,
            card_id=option.card_id,
            quantity=1,
            first_acquired_at=stamp,
            last_acquired_at=stamp,
        )
        .on_conflict_do_update(
            index_elements=[UserCard.user_id, UserCard.card_id],
            set_={"quantity": UserCard.quantity + 1, "last_acquired_at": stamp},
        )
    )
    session.state = "claimed"
    session.completed_at = stamp
    db.get(DailyReward, session.reward_id).state = "claimed"
    db.flush()
    return acquisition_public(db, record)
