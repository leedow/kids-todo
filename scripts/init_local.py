"""Initialize local development without hardcoded administrator credentials."""

import os
import secrets
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy import select

from app.cli import seed_cards
from app.core.config import get_settings
from app.db.models import User
from app.db.session import SessionLocal
from app.modules.auth.service import passwords


def main():
    output = ROOT / ".cache/local-admin.txt"
    created = False
    try:
        with SessionLocal.begin() as db:
            seed_cards(db)
            if db.scalar(select(User.id).where(User.role == "admin")):
                print("管理员已存在，保留现有账号与密码。示例卡已检查。")
                return
            if db.scalar(select(User.id).where(User.username == "admin")):
                raise RuntimeError("admin 用户名已被占用，请通过 CLI 指定另一个管理员用户名")
            password = secrets.token_urlsafe(18)
            db.add(
                User(
                    username="admin",
                    display_name="应用管理员",
                    role="admin",
                    password_hash=passwords.hash(password),
                )
            )
            db.flush()
            output.parent.mkdir(exist_ok=True)
            descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            created = True
            with os.fdopen(descriptor, "w") as file:
                file.write(
                    f"本地管理员（请妥善保存，勿提交到 Git）\n入口：{get_settings().app_origin}/admin/login\n账号：admin\n密码：{password}\n"
                )
    except BaseException:
        if created:
            output.unlink(missing_ok=True)
        raise
    print(f"管理员已创建，随机凭据保存在 {output}（仅当前用户可读）。")


if __name__ == "__main__":
    main()
