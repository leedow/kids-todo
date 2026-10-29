from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Shanghai")


def now() -> datetime:
    return datetime.now(UTC)


def today() -> date:
    return now().astimezone(TZ).date()
