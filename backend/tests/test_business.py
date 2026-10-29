import io
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime
from threading import Barrier

import pytest
from PIL import Image
from sqlalchemy import event, func, select, text
from sqlalchemy.exc import IntegrityError

from app.cli import seed_cards
from app.core import clock
from app.core.errors import AppError
from app.db.models import Acquisition, Card, DailyReward, DrawSession, TaskVersion, UserCard
from app.modules.cards.service import upload_image
from app.modules.rewards.service import open_draw, select_card
from app.modules.tasks.service import applies, complete, day_public, prepare_day, save_task
from tests.conftest import sign_in


def task_input(**extra):
    return {"name": "阅读", "rule_type": "daily", "start_date": clock.today(), **extra}


def earned(factory, user):
    with factory.begin() as db:
        saved = save_task(db, user.id, task_input())
        complete(db, user.id, uuid.UUID(saved["day"]["tasks"][0]["instance_id"]), True)
        return db.scalar(select(DailyReward)).id


@pytest.mark.parametrize(
    "rule,weekdays,on,expected",
    [
        ("once", [], date(2026, 10, 28), True),
        ("once", [], date(2026, 10, 29), False),
        ("daily", [], date(2026, 10, 29), True),
        ("weekly", [1, 3, 5], date(2026, 10, 28), True),
        ("weekly", [1, 3, 5], date(2026, 10, 29), False),
        ("daily", [], date(2026, 10, 27), False),
    ],
)
def test_schedule(rule, weekdays, on, expected):
    version = TaskVersion(state="active", rule_type=rule, start_date=date(2026, 10, 28), weekdays=weekdays)
    assert applies(version, on) is expected


def test_empty_day_never_grants(factory, people):
    with factory.begin() as db:
        prepare_day(db, people[0].id, clock.today())
        assert day_public(db, people[0].id, clock.today())["reward"]["state"] == "locked"
        assert db.scalar(select(func.count()).select_from(DailyReward)) == 0


def test_earned_reward_survives_undo_and_new_tasks(factory, people):
    reward_id = earned(factory, people[0])
    with factory.begin() as db:
        original = day_public(db, people[0].id, clock.today())
        complete(db, people[0].id, uuid.UUID(original["tasks"][0]["instance_id"]), False)
        save_task(db, people[0].id, task_input(name="运动"))
        day = day_public(db, people[0].id, clock.today())
        assert day["progress"] == {"total": 2, "completed": 0}
        assert day["reward"]["id"] == str(reward_id)
        assert db.get(DailyReward, reward_id).evidence["total"] == 1


def test_versions_restore_history_and_forbid_backfill(factory, people, monkeypatch):
    with factory.begin() as db:
        result = save_task(db, people[0].id, task_input())
        instance_id = uuid.UUID(result["day"]["tasks"][0]["instance_id"])
        task_id = uuid.UUID(result["task"]["id"])
    monkeypatch.setattr(clock, "now", lambda: datetime(2026, 10, 30, 4, tzinfo=UTC))
    with factory.begin() as db:
        save_task(db, people[0].id, {"name": "阅读新名称", "state": "paused"}, task_id)
        assert day_public(db, people[0].id, date(2026, 10, 28))["tasks"][0]["name"] == "阅读"
        assert day_public(db, people[0].id, date(2026, 10, 29))["tasks"][0]["name"] == "阅读"
        assert day_public(db, people[0].id, date(2026, 10, 30))["tasks"] == []
        with pytest.raises(AppError, match="只能修改今天"):
            complete(db, people[0].id, instance_id, True)


def test_prepare_and_complete_are_idempotent(factory, people):
    with factory.begin() as db:
        result = save_task(db, people[0].id, task_input())
        instance_id = uuid.UUID(result["day"]["tasks"][0]["instance_id"])
        first = prepare_day(db, people[0].id, clock.today())
        assert prepare_day(db, people[0].id, clock.today()).id == first.id
        complete(db, people[0].id, instance_id, True)
        complete(db, people[0].id, instance_id, True)
        assert db.scalar(select(func.count()).select_from(DailyReward)) == 1


def test_same_day_pause_restore_preserves_completion(factory, people):
    with factory.begin() as db:
        result = save_task(db, people[0].id, task_input())
        task_id = uuid.UUID(result["task"]["id"])
        complete(db, people[0].id, uuid.UUID(result["day"]["tasks"][0]["instance_id"]), True)
        save_task(db, people[0].id, {"state": "paused"}, task_id)
        assert day_public(db, people[0].id, clock.today())["progress"]["total"] == 0
        save_task(db, people[0].id, {"state": "active"}, task_id)
        assert day_public(db, people[0].id, clock.today())["progress"]["completed"] == 1


def test_concurrent_last_completion(factory, people):
    with factory.begin() as db:
        result = save_task(db, people[0].id, task_input())
        instance_id = uuid.UUID(result["day"]["tasks"][0]["instance_id"])
    barrier = Barrier(4)

    def worker(_):
        barrier.wait()
        with factory.begin() as db:
            return complete(db, people[0].id, instance_id, True)["reward"]["id"]

    with ThreadPoolExecutor(max_workers=4) as pool:
        assert len(set(pool.map(worker, range(4)))) == 1
    with factory() as db:
        assert db.scalar(select(func.count()).select_from(DailyReward)) == 1


def test_fixed_candidates_concurrent_draw_and_choice(factory, people):
    reward_id = earned(factory, people[0])
    with factory.begin() as db:
        seed_cards(db)
    barrier = Barrier(3)

    def opening(_):
        barrier.wait()
        with factory.begin() as db:
            return open_draw(db, people[0].id, reward_id)

    with ThreadPoolExecutor(max_workers=3) as pool:
        draws = list(pool.map(opening, range(3)))
    assert len({d["id"] for d in draws}) == 1
    assert len({o["card"]["id"] for o in draws[0]["options"]}) == 3
    assert draws[0]["options"] == draws[1]["options"]
    session_id = uuid.UUID(draws[0]["id"])
    barrier = Barrier(2)

    def choosing(option):
        barrier.wait()
        try:
            with factory.begin() as db:
                return select_card(db, people[0].id, session_id, uuid.UUID(option["id"]))
        except AppError as e:
            return e.code

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(choosing, draws[0]["options"][:2]))
    assert sum(isinstance(r, dict) for r in results) == 1
    assert "ALREADY_SELECTED" in results
    with factory.begin() as db:
        record = db.scalar(select(Acquisition))
        assert db.scalar(select(func.count()).select_from(Acquisition)) == 1
        assert db.scalar(select(UserCard.quantity)) == 1
        assert select_card(db, people[0].id, session_id, record.option_id)["id"] == str(record.id)


def test_insufficient_pool_keeps_reward(factory, people):
    reward_id = earned(factory, people[0])
    with factory.begin() as db:
        with pytest.raises(AppError) as error:
            open_draw(db, people[0].id, reward_id)
        assert error.value.code == "CARD_POOL_UNAVAILABLE"
        assert db.get(DailyReward, reward_id).state == "available"
        assert db.scalar(select(func.count()).select_from(DrawSession)) == 0


def test_late_claim_and_archived_option(factory, people, monkeypatch):
    reward_id = earned(factory, people[0])
    with factory.begin() as db:
        seed_cards(db)
        draw = open_draw(db, people[0].id, reward_id)
        option = draw["options"][0]
        db.get(Card, uuid.UUID(option["card"]["id"])).status = "archived"
    monkeypatch.setattr(clock, "now", lambda: datetime(2026, 10, 30, 4, tzinfo=UTC))
    with factory.begin() as db:
        result = select_card(db, people[0].id, uuid.UUID(draw["id"]), uuid.UUID(option["id"]))
        assert result["quantity"] == 1


def test_grant_failure_rolls_back_everything(factory, people, test_engine):
    reward_id = earned(factory, people[0])
    with factory.begin() as db:
        seed_cards(db)
        draw = open_draw(db, people[0].id, reward_id)

    def fail(conn, cursor, statement, parameters, context, executemany):
        if statement.startswith("INSERT INTO user_cards"):
            raise RuntimeError("injected storage failure")

    event.listen(test_engine, "before_cursor_execute", fail)
    try:
        with pytest.raises(RuntimeError), factory.begin() as db:
            select_card(db, people[0].id, uuid.UUID(draw["id"]), uuid.UUID(draw["options"][0]["id"]))
    finally:
        event.remove(test_engine, "before_cursor_execute", fail)
    with factory.begin() as db:
        assert db.scalar(select(func.count()).select_from(Acquisition)) == 0
        assert db.get(DailyReward, reward_id).state == "drawing"
        assert (
            select_card(db, people[0].id, uuid.UUID(draw["id"]), uuid.UUID(draw["options"][0]["id"]))[
                "quantity"
            ]
            == 1
        )


def test_database_rejects_version_rewrite(factory, people):
    with factory.begin() as db:
        save_task(db, people[0].id, task_input())
    with pytest.raises(IntegrityError), factory.begin() as db:
        db.execute(text("UPDATE task_versions SET name='rewritten'"))


def test_account_switch_and_ownership(client, people):
    one = sign_in(client)
    first = client.post(
        "/api/v1/me/tasks", headers=one, json={**task_input(), "start_date": str(clock.today())}
    )
    assert first.status_code == 201, first.text
    two = sign_in(client, "child-two")
    assert len(client.get("/api/v1/auth/accounts").json()["accounts"]) == 2
    one["X-CSRF-Token"] = two["X-CSRF-Token"]
    assert client.get("/api/v1/me", headers=one).json()["user"]["username"] == "child-one"
    assert client.get("/api/v1/me/tasks", headers=two).json()["total"] == 0
    assert (
        client.patch(
            "/api/v1/me/tasks/" + first.json()["task"]["id"], headers=two, json={"name": "越权"}
        ).status_code
        == 404
    )
    assert client.delete("/api/v1/auth/accounts/" + one["X-Account-ID"], headers=two).status_code == 204
    assert client.get("/api/v1/me", headers=two).status_code == 200
    assert client.get("/api/v1/me", headers=one).status_code == 403


def test_admin_session_is_separate_and_reset_revokes(client, people):
    child_headers = sign_in(client)
    assert client.get("/api/v1/admin/users", headers=child_headers).status_code == 401
    admin_headers = sign_in(client, "test-admin", admin=True)
    assert client.get("/api/v1/me", headers=child_headers).status_code == 200
    assert (
        client.patch(
            "/api/v1/admin/users/" + str(people[0].id),
            headers=admin_headers,
            json={"password": "new-test-password-456"},
        ).status_code
        == 200
    )
    assert client.get("/api/v1/me", headers=child_headers).status_code == 403


def test_csrf_origin_and_password_redaction(client, people):
    headers = sign_in(client)
    assert (
        client.post(
            "/api/v1/me/tasks", headers={"X-Account-ID": headers["X-Account-ID"]}, json={}
        ).status_code
        == 403
    )
    headers["Origin"] = "https://other.example"
    assert client.post("/api/v1/me/tasks", headers=headers, json={}).status_code == 403
    result = client.post("/api/v1/auth/accounts", json={"username": "x", "password": "x" * 200})
    assert "x" * 200 not in result.text


def test_get_day_does_not_materialize(client, people, factory):
    headers = sign_in(client)
    assert client.get("/api/v1/me/days/" + str(clock.today()), headers=headers).status_code == 200
    from app.db.models import UserDay

    with factory() as db:
        assert db.scalar(select(func.count()).select_from(UserDay)) == 0


def test_upload_format_limits_and_normalization(factory):
    with factory.begin() as db:
        with pytest.raises(AppError):
            upload_image(db, b'<svg xmlns="http://www.w3.org/2000/svg"/>')
        with pytest.raises(AppError):
            upload_image(db, b"x" * (5 * 1024 * 1024 + 1))
        buf = io.BytesIO()
        Image.new("RGB", (32, 32), "red").save(buf, "PNG")
        result = upload_image(db, buf.getvalue())
        assert result["url"].endswith(".webp")
        assert result["width"] == 32


def test_duplicate_cards_increment_quantity_not_unique_progress(factory, people, monkeypatch):
    from app.modules.cards.service import collection, collection_sets

    reward_id = earned(factory, people[0])
    with factory.begin() as db:
        seed_cards(db)
        first = open_draw(db, people[0].id, reward_id)
        desired = first["options"][0]["card"]["id"]
        keep = {uuid.UUID(o["card"]["id"]) for o in first["options"]}
        for card in db.scalars(select(Card)):
            if card.id not in keep:
                card.status = "archived"
        select_card(db, people[0].id, uuid.UUID(first["id"]), uuid.UUID(first["options"][0]["id"]))
    monkeypatch.setattr(clock, "now", lambda: datetime(2026, 10, 29, 4, tzinfo=UTC))
    with factory.begin() as db:
        prepare_day(db, people[0].id, clock.today())
        task = day_public(db, people[0].id, clock.today())["tasks"][0]
        result = complete(db, people[0].id, uuid.UUID(task["instance_id"]), True)
        second = open_draw(db, people[0].id, uuid.UUID(result["reward"]["id"]))
        option = next(o for o in second["options"] if o["card"]["id"] == desired)
        assert (
            select_card(db, people[0].id, uuid.UUID(second["id"]), uuid.UUID(option["id"]))["quantity"] == 2
        )
        owned = collection(db, people[0].id, owned_only=True)
        assert owned["total"] == 1 and owned["items"][0]["quantity"] == 2
        progress = collection_sets(db, people[0].id)["items"][0]
        assert (progress["owned_unique"], progress["total"]) == (1, 3)


def test_stats_separate_reward_date_from_late_acquisition(factory, people, monkeypatch):
    from app.modules.admin.service import stats

    reward_id = earned(factory, people[0])
    with factory.begin() as db:
        seed_cards(db)
        draw = open_draw(db, people[0].id, reward_id)
    monkeypatch.setattr(clock, "now", lambda: datetime(2026, 10, 29, 4, tzinfo=UTC))
    with factory.begin() as db:
        select_card(db, people[0].id, uuid.UUID(draw["id"]), uuid.UUID(draw["options"][0]["id"]))
        summary = stats(db, date(2026, 10, 28), date(2026, 10, 29))
        assert summary["days"][0]["rewards_earned"] == 1
        assert summary["days"][0]["cards_granted"] == 0
        assert summary["days"][1]["rewards_earned"] == 0
        assert summary["days"][1]["cards_granted"] == 1
        assert summary["total_users"] == 2


def test_login_failure_counter_commits_and_throttles(client, people):
    from app.core.config import get_settings

    csrf = client.get("/api/v1/auth/csrf").json()["csrf_token"]
    headers = {"Origin": get_settings().app_origin, "X-CSRF-Token": csrf}
    for _ in range(5):
        assert (
            client.post(
                "/api/v1/auth/accounts",
                headers=headers,
                json={"username": "child-one", "password": "wrong-password"},
            ).status_code
            == 401
        )
    assert (
        client.post(
            "/api/v1/auth/accounts",
            headers=headers,
            json={"username": "child-one", "password": "test-password-123"},
        ).status_code
        == 429
    )


def test_database_rejects_cross_account_instance(factory, people):
    from app.db.models import TaskInstance, UserDay

    with factory.begin() as db:
        result = save_task(db, people[0].id, task_input())
        other_day = UserDay(user_id=people[1].id, business_date=clock.today(), prepared_at=clock.now())
        db.add(other_day)
        db.flush()
        values = dict(
            user_id=people[1].id,
            day_id=other_day.id,
            task_id=uuid.UUID(result["task"]["id"]),
            task_version_id=uuid.UUID(result["task"]["version_id"]),
        )
    with pytest.raises(IntegrityError), factory.begin() as db:
        db.add(TaskInstance(**values))
        db.flush()


def test_password_whitespace_roundtrip_is_preserved(client, people):
    admin = sign_in(client, "test-admin", admin=True)
    password = "  password-with-spaces  "
    created = client.post(
        "/api/v1/admin/users",
        headers=admin,
        json={"username": "space-child", "display_name": "新账号", "password": password},
    )
    assert created.status_code == 201
    from app.core.config import get_settings

    csrf = client.get("/api/v1/auth/csrf").json()["csrf_token"]
    logged = client.post(
        "/api/v1/auth/accounts",
        json={"username": "space-child", "password": password},
        headers={"Origin": get_settings().app_origin, "X-CSRF-Token": csrf},
    )
    assert logged.status_code == 200
