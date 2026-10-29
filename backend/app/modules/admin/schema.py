from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class UserInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(pattern=r"^[a-zA-Z0-9_.-]{3,40}$")
    display_name: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=8, max_length=128)
    avatar_key: Literal["fox", "rabbit", "bear", "cat", "panda", "lion"] = "fox"

    @field_validator("username", "display_name", mode="before")
    @classmethod
    def trim_labels(cls, value):
        return value.strip() if isinstance(value, str) else value


class UserPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    display_name: str | None = Field(default=None, min_length=1, max_length=40)
    avatar_key: Literal["fox", "rabbit", "bear", "cat", "panda", "lion"] | None = None
    status: Literal["active", "disabled"] | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)

    @field_validator("display_name", mode="before")
    @classmethod
    def trim_label(cls, value):
        return value.strip() if isinstance(value, str) else value
