"""Launch an isolated browser-test app; never seed or truncate the application schema."""

import os
import shutil
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url


def main():
    source = os.environ.get(
        "TEST_DATABASE_URL", "postgresql+psycopg://kids:kids@localhost:55432/kidstodo_test"
    )
    schema = "kids_e2e_" + uuid.uuid4().hex
    root_engine = create_engine(source)
    media = ROOT / ".cache" / schema
    with root_engine.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    url = make_url(source).update_query_dict({"options": f"-csearch_path={schema}"})
    os.environ["DATABASE_URL"] = url.render_as_string(hide_password=False)
    os.environ["MEDIA_ROOT"] = str(media)
    os.environ["APP_ORIGIN"] = os.environ.get("APP_ORIGIN", "http://localhost:18173")
    os.environ["APP_ENV"] = "development"
    os.environ["COOKIE_SECURE"] = "false"
    try:
        from app.cli import seed_cards
        from app.core import clock
        from app.db.models import User
        from app.db.session import SessionLocal, engine
        from app.modules.auth.service import passwords
        from app.modules.tasks.service import save_task

        cfg = Config(str(ROOT / "backend/alembic.ini"))
        cfg.set_main_option("script_location", str(ROOT / "backend/alembic"))
        with engine.begin() as connection:
            cfg.attributes["connection"] = connection
            command.upgrade(cfg, "head")
        with SessionLocal.begin() as db:
            people = [
                User(
                    username=username,
                    display_name=name,
                    role=role,
                    avatar_key=avatar,
                    password_hash=passwords.hash("e2e-only-password-123"),
                )
                for username, name, role, avatar in [
                    ("e2e-child-one", "朵朵", "child", "fox"),
                    ("e2e-child-two", "星星", "child", "rabbit"),
                    ("e2e-admin", "测试管理员", "admin", "bear"),
                ]
            ]
            db.add_all(people)
            db.flush()
            seed_cards(db)
            for name, icon, color, at in [
                ("阅读20分钟", "book", "mint", "19:00"),
                ("练习画画", "brush", "peach", "20:00"),
            ]:
                save_task(
                    db,
                    people[0].id,
                    {
                        "name": name,
                        "rule_type": "daily",
                        "start_date": clock.today(),
                        "icon": icon,
                        "color": color,
                        "planned_time": at,
                    },
                )
        import uvicorn

        uvicorn.run("app.main:app", host="127.0.0.1", port=int(os.environ.get("E2E_API_PORT", "18174")))
        engine.dispose()
    finally:
        with root_engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
        root_engine.dispose()
        shutil.rmtree(media, ignore_errors=True)


if __name__ == "__main__":
    main()
