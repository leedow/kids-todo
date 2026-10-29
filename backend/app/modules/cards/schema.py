from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CategoryInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=60)
    sort_order: int = 0
    status: Literal["active", "archived"] = "active"


class SetInput(CategoryInput):
    category_id: UUID
    description: str = Field(default="", max_length=1000)
    cover_asset_id: UUID | None = None


class CardInput(CategoryInput):
    set_id: UUID
    description: str = Field(default="", max_length=1000)
    image_asset_id: UUID
    rarity: Literal["common", "rare", "epic", "legendary"] = "common"
    draw_weight: int = Field(default=10, ge=1, le=10000)
