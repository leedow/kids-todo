from datetime import date, time
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

ICONS = {"book", "pencil", "sport", "brush", "music", "bed", "water", "bag", "star", "plant"}
COLORS = {"mint", "peach", "lavender", "sky", "yellow"}


class TaskInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=60)
    description: str = Field(default="", max_length=500)
    icon: str = "star"
    color: str = "mint"
    sort_order: int = Field(default=0, ge=-100000, le=100000)
    state: Literal["active", "paused", "archived"] = "active"
    rule_type: Literal["once", "daily", "weekly"]
    start_date: date
    end_date: date | None = None
    planned_time: time | None = None
    weekdays: list[int] = Field(default_factory=list, max_length=7)

    @model_validator(mode="after")
    def check_rule(self):
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("结束日期不能早于开始日期")
        if self.icon not in ICONS or self.color not in COLORS:
            raise ValueError("请选择预设图标和颜色")
        self.weekdays = sorted(set(self.weekdays))
        if self.rule_type == "weekly" and (
            not self.weekdays or any(d not in range(1, 8) for d in self.weekdays)
        ):
            raise ValueError("每周任务必须选择有效星期")
        if self.rule_type != "weekly":
            self.weekdays = []
        if self.rule_type == "once":
            self.end_date = self.start_date
        if self.planned_time and self.planned_time.tzinfo:
            raise ValueError("计划时间使用本地时刻，不包含时区")
        return self


class CompletionInput(BaseModel):
    completed: bool
