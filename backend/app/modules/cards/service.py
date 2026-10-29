import io
import uuid
import warnings

from PIL import Image, UnidentifiedImageError
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import AppError, missing
from app.db.models import Card, CardCategory, CardSet, MediaAsset, UserCard
from app.modules.cards.schema import CardInput, CategoryInput, SetInput

CONTENT = {
    "card-categories": (CardCategory, CategoryInput),
    "card-sets": (CardSet, SetInput),
    "cards": (Card, CardInput),
}


def asset_url(asset: MediaAsset | None) -> str | None:
    return f"/media/{asset.storage_key}" if asset else None


def card_public(db: Session, card: Card) -> dict:
    card_set = db.get(CardSet, card.set_id)
    category = db.get(CardCategory, card_set.category_id)
    return {
        "id": str(card.id),
        "name": card.name,
        "description": card.description,
        "set_id": str(card.set_id),
        "set_name": card_set.name,
        "category_id": str(category.id),
        "category_name": category.name,
        "image_asset_id": str(card.image_asset_id),
        "image_url": asset_url(db.get(MediaAsset, card.image_asset_id)),
        "rarity": card.rarity,
        "draw_weight": card.draw_weight,
        "sort_order": card.sort_order,
        "status": card.status,
    }


def content_public(db: Session, row) -> dict:
    if isinstance(row, Card):
        return card_public(db, row)
    result = {"id": str(row.id), "name": row.name, "status": row.status, "sort_order": row.sort_order}
    if isinstance(row, CardSet):
        result.update(
            category_id=str(row.category_id),
            description=row.description,
            cover_asset_id=str(row.cover_asset_id) if row.cover_asset_id else None,
            cover_url=asset_url(db.get(MediaAsset, row.cover_asset_id)) if row.cover_asset_id else None,
        )
    return result


def content_type(kind: str):
    if kind not in CONTENT:
        missing()
    return CONTENT[kind]


def save_content(db: Session, kind: str, payload: dict, item_id: uuid.UUID | None = None):
    model, schema = content_type(kind)
    row = db.get(model, item_id) if item_id else None
    if item_id and not row:
        missing()
    data = {field: getattr(row, field) for field in schema.model_fields} if row else {}
    data.update(payload)
    values = schema.model_validate(data).model_dump()
    for key, reference in (
        ("category_id", CardCategory),
        ("set_id", CardSet),
        ("image_asset_id", MediaAsset),
        ("cover_asset_id", MediaAsset),
    ):
        if values.get(key) and not db.get(reference, values[key]):
            raise AppError("INVALID_REFERENCE", "关联分类、卡片集或图片不存在", 422)
    if row is None:
        row = model(**values)
        db.add(row)
    else:
        for key, value in values.items():
            setattr(row, key, value)
    db.flush()
    return content_public(db, row)


def upload_image(db: Session, data: bytes) -> dict:
    if len(data) > 5 * 1024 * 1024:
        raise AppError("IMAGE_TOO_LARGE", "图片不能超过5MB", 413)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                if image.format not in {"JPEG", "PNG", "WEBP"}:
                    raise AppError("INVALID_IMAGE", "只支持JPEG、PNG或WebP图片", 422)
                if image.width * image.height > 16_000_000:
                    raise AppError("IMAGE_TOO_LARGE", "图片不能超过1600万像素", 413)
                image.load()
                clean = image.convert("RGBA" if "A" in image.getbands() else "RGB")
                clean.thumbnail((1600, 1600))
                output = io.BytesIO()
                clean.save(output, format="WEBP", quality=88, exif=b"")
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ):
        raise AppError("INVALID_IMAGE", "无法读取这张图片", 422) from None
    key = f"{uuid.uuid4().hex}.webp"
    root = get_settings().media_root
    root.mkdir(parents=True, exist_ok=True)
    content = output.getvalue()
    (root / key).write_bytes(content)
    asset = MediaAsset(
        storage_key=key,
        mime_type="image/webp",
        width=clean.width,
        height=clean.height,
        size_bytes=len(content),
    )
    db.add(asset)
    db.flush()
    return {"id": str(asset.id), "url": asset_url(asset), "width": asset.width, "height": asset.height}


def active_pool(db: Session) -> list[Card]:
    return list(
        db.scalars(
            select(Card)
            .join(CardSet)
            .join(CardCategory)
            .where(Card.status == "active", CardSet.status == "active", CardCategory.status == "active")
        )
    )


def collection(
    db: Session,
    user_id: uuid.UUID,
    category_id=None,
    set_id=None,
    rarity=None,
    owned_only=False,
    page=1,
    page_size=20,
):
    query = (
        select(Card, UserCard)
        .join(CardSet)
        .join(CardCategory)
        .outerjoin(UserCard, and_(UserCard.card_id == Card.id, UserCard.user_id == user_id))
        .where(
            or_(
                and_(Card.status == "active", CardSet.status == "active", CardCategory.status == "active"),
                UserCard.quantity.is_not(None),
            )
        )
    )
    if category_id:
        query = query.where(CardSet.category_id == category_id)
    if set_id:
        query = query.where(Card.set_id == set_id)
    if rarity:
        query = query.where(Card.rarity == rarity)
    if owned_only:
        query = query.where(UserCard.quantity.is_not(None))
    rows = list(db.execute(query.order_by(CardSet.sort_order, Card.sort_order, Card.name)))
    items = []
    for card, owned in rows[(page - 1) * page_size : page * page_size]:
        items.append(
            {
                **card_public(db, card),
                "quantity": owned.quantity if owned else 0,
                "first_acquired_at": owned.first_acquired_at if owned else None,
                "last_acquired_at": owned.last_acquired_at if owned else None,
            }
        )
    return {"items": items, "total": len(rows), "page": page, "page_size": page_size}


def collection_sets(db: Session, user_id: uuid.UUID):
    owned = {r.card_id for r in db.scalars(select(UserCard).where(UserCard.user_id == user_id))}
    result = []
    for card_set in db.scalars(
        select(CardSet)
        .join(CardCategory)
        .where(CardSet.status == "active", CardCategory.status == "active")
        .order_by(CardSet.sort_order)
    ):
        ids = list(db.scalars(select(Card.id).where(Card.set_id == card_set.id, Card.status == "active")))
        result.append(
            {
                **content_public(db, card_set),
                "total": len(ids),
                "owned_unique": sum(card_id in owned for card_id in ids),
            }
        )
    return {"items": result}
