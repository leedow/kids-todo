import os
import uuid
from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core import clock
from app.core.config import get_settings
from app.db.models import User
from app.db.session import Base, get_db
from app.main import app
from app.modules.auth.service import passwords


@pytest.fixture(scope="session")
def test_engine():
    url = os.environ.get("TEST_DATABASE_URL", get_settings().database_url)
    root = create_engine(url)
    schema = "kids_test_" + uuid.uuid4().hex
    with root.begin() as connection:
        connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"}, pool_size=12)
    cfg = Config(str(Path(__file__).resolve().parents[1] / "alembic.ini"))
    cfg.set_main_option("script_location", str(Path(__file__).resolve().parents[1] / "alembic"))
    with engine.begin() as connection:
        cfg.attributes["connection"] = connection
        command.upgrade(cfg, "head")
    yield engine
    engine.dispose()
    with root.begin() as connection:
        connection.execute(text(f'DROP SCHEMA "{schema}" CASCADE'))
    root.dispose()


@pytest.fixture
def factory(test_engine, monkeypatch, tmp_path):
    tables = ", ".join(f'"{table.name}"' for table in Base.metadata.sorted_tables)
    with test_engine.begin() as connection:
        connection.execute(text(f"TRUNCATE {tables} CASCADE"))
    monkeypatch.setattr(get_settings(), "media_root", tmp_path)
    monkeypatch.setattr(clock, "now", lambda: datetime(2026, 10, 28, 4, tzinfo=UTC))
    return sessionmaker(test_engine, expire_on_commit=False)


@pytest.fixture
def people(factory):
    with factory.begin() as db:
        users = [
            User(
                username=name, display_name=name, password_hash=passwords.hash("test-password-123"), role=role
            )
            for name, role in [("child-one", "child"), ("child-two", "child"), ("test-admin", "admin")]
        ]
        db.add_all(users)
        db.flush()
        return users


@pytest.fixture
def client(factory):
    def override():
        with factory.begin() as db:
            yield db

    app.dependency_overrides[get_db] = override
    with TestClient(app) as value:
        yield value
    app.dependency_overrides.clear()


def sign_in(client, username="child-one", admin=False):
    scope = "admin" if admin else "child"
    csrf = client.get(f"/api/v1/auth/csrf?scope={scope}").json()["csrf_token"]
    response = client.post(
        "/api/v1/admin/auth/login" if admin else "/api/v1/auth/accounts",
        json={"username": username, "password": "test-password-123"},
        headers={"Origin": get_settings().app_origin, "X-CSRF-Token": csrf},
    )
    assert response.status_code == 200, response.text
    result = response.json()
    return {
        "Origin": get_settings().app_origin,
        "X-CSRF-Token": result["csrf_token"],
        "X-Account-ID": result["user"]["id"],
    }
