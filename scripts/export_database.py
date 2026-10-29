"""Generate the physical data dictionary from the implemented SQLAlchemy metadata."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import CheckConstraint, ForeignKeyConstraint, UniqueConstraint
from sqlalchemy.dialects import postgresql
from sqlalchemy.schema import CreateIndex

from app.db import models  # noqa: F401
from app.db.session import Base

intro = """# PostgreSQL 数据库设计

本文字段表由 scripts/export_database.py 从实际模型生成；结构变更后重新生成。以Alembic迁移为结构事实来源。

## 约定

UUID主键由程序生成，事件时间为带时区时间，业务日期使用DATE。首版固定上海时区。外键默认限制破坏历史的删除；会话成员仅在删除会话时级联清理。所有业务表保存在同一应用schema。

```mermaid
erDiagram
    USERS ||--o{ TASKS : owns
    TASKS ||--|{ TASK_VERSIONS : versions
    USERS ||--o{ USER_DAYS : has
    USER_DAYS ||--o{ TASK_INSTANCES : contains
    TASK_VERSIONS ||--o{ TASK_INSTANCES : describes
    USER_DAYS ||--o| DAILY_REWARDS : unlocks
    DAILY_REWARDS ||--o| CARD_DRAW_SESSIONS : opens
    CARD_DRAW_SESSIONS ||--|{ CARD_DRAW_OPTIONS : offers
    CARD_DRAW_SESSIONS ||--o| CARD_ACQUISITION_RECORDS : grants
    USERS ||--o{ USER_CARDS : owns
    CARD_CATEGORIES ||--o{ CARD_SETS : groups
    CARD_SETS ||--o{ CARDS : contains
    CARDS ||--o{ USER_CARDS : collected
    AUTH_SESSIONS ||--o{ SESSION_ACCOUNTS : contains
    USERS ||--o{ SESSION_ACCOUNTS : authenticates
    USERS ||--o{ USER_ACTIVITY_DAYS : visits
    MEDIA_ASSETS ||--o{ CARDS : illustrates
```

## 核心状态与一致性

- 任务版本：active、paused、archived，修改新增版本；归档终止。
- 每日实例：is_included与completed_at分别表达是否参与和完成，不用任务表completed字段表示循环任务。
- 无奖励记录表示locked；奖励available→drawing→claimed，只向前。
- 抽卡会话open→claimed；获得记录唯一对应会话。
- daily_rewards.evidence保存解锁时total及tasks数组，含instance_id、version_id、name、completed_at。
- 候选与获得记录snapshot保存卡片当时资料和图片引用；user_cards是可重建汇总。

所有同一儿童业务写入先锁users行，再操作每日实例/奖励/选卡，最后提交。READ COMMITTED配合串行行锁和数据库唯一约束防止重复发放。

第二份迁移增加触发器：禁止修改/删除任务版本、候选和获得记录；禁止修改已解锁奖励依据或倒退状态；禁止修改过去日期实例。三候选数量、重复规则及当前日期资格由服务层验证。跨归属关系、选项归属、位置与权重范围由数据库约束。

## 实际字段、约束与索引

"""


def render():
    result = [intro]
    dialect = postgresql.dialect()
    for table in Base.metadata.sorted_tables:
        result.append(f"### {table.name}\n\n| 字段 | 类型 | 可空 | 主键 | 默认 |\n|---|---|---|---|---|\n")
        for column in table.columns:
            default = "—"
            if column.server_default is not None:
                default = str(column.server_default.arg)
            elif column.default is not None:
                default = "程序生成" if column.default.is_callable else str(column.default.arg)
            result.append(
                f"| {column.name} | {column.type.compile(dialect=dialect)} | "
                f"{'是' if column.nullable else '否'} | {'是' if column.primary_key else '否'} | {default} |\n"
            )
        rules = []
        for constraint in table.constraints:
            if isinstance(constraint, UniqueConstraint):
                rules.append("唯一：" + ", ".join(c.name for c in constraint.columns))
            elif isinstance(constraint, CheckConstraint):
                rules.append("检查：`" + str(constraint.sqltext) + "`")
            elif isinstance(constraint, ForeignKeyConstraint):
                rules.append(
                    "外键："
                    + ", ".join(f"{e.parent.name} → {e.target_fullname}" for e in constraint.elements)
                )
        if rules:
            result.append("\n" + "\n".join("- " + r for r in sorted(rules)) + "\n")
        if table.indexes:
            result.append("\n```sql\n")
            for index in sorted(table.indexes, key=lambda i: i.name):
                result.append(str(CreateIndex(index).compile(dialect=dialect)) + ";\n")
            result.append("```\n")
        result.append("\n")
    (ROOT / "docs/DATABASE.md").write_text("".join(result))
    print("数据库字典已更新。")


if __name__ == "__main__":
    render()
