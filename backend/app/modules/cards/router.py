import uuid

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.core.dependencies import DB, Child
from app.core.errors import missing
from app.core.schema import OwnedCard, Page
from app.db.models import Acquisition, Card, CardCategory, CardSet, UserCard
from app.modules.cards import service

router = APIRouter()


@router.get("/catalog/categories")
def catalog(user: Child, db: DB):
    categories = []
    for category in db.scalars(
        select(CardCategory).where(CardCategory.status == "active").order_by(CardCategory.sort_order)
    ):
        categories.append(
            {
                **service.content_public(db, category),
                "sets": [
                    service.content_public(db, s)
                    for s in db.scalars(
                        select(CardSet)
                        .where(CardSet.category_id == category.id, CardSet.status == "active")
                        .order_by(CardSet.sort_order)
                    )
                ],
            }
        )
    return {"items": categories}


@router.get("/me/collection", response_model=Page[OwnedCard])
def collection(
    user: Child,
    db: DB,
    category_id: uuid.UUID | None = None,
    set_id: uuid.UUID | None = None,
    rarity: str | None = None,
    owned_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    return service.collection(db, user.id, category_id, set_id, rarity, owned_only, page, page_size)


@router.get("/me/collection/sets")
def sets(user: Child, db: DB):
    return service.collection_sets(db, user.id)


@router.get("/me/collection/cards/{card_id}")
def detail(card_id: uuid.UUID, user: Child, db: DB):
    card = db.get(Card, card_id)
    owned = db.get(UserCard, (user.id, card_id))
    if not card:
        missing()
    card_set = db.get(CardSet, card.set_id)
    category = db.get(CardCategory, card_set.category_id)
    if not owned and any(s.status != "active" for s in (card, card_set, category)):
        missing()
    return {
        **service.card_public(db, card),
        "quantity": owned.quantity if owned else 0,
        "first_acquired_at": owned.first_acquired_at if owned else None,
        "last_acquired_at": owned.last_acquired_at if owned else None,
        "acquisitions": [
            {"id": str(a.id), "acquired_at": a.acquired_at, "snapshot": a.snapshot}
            for a in db.scalars(
                select(Acquisition)
                .where(Acquisition.user_id == user.id, Acquisition.card_id == card_id)
                .order_by(Acquisition.acquired_at.desc())
            )
        ],
    }
