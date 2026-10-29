"""Exercise Compose backup/restore and HTTPS in disposable, uniquely named stacks."""

import json
import os
import secrets
import shutil
import ssl
import subprocess
import sys
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(args, *, env=None, input=None, cwd=ROOT):
    result = subprocess.run(args, check=False, cwd=cwd, env=env, input=input, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f"命令失败：{' '.join(args)}\n{result.stdout[-3000:]}\n{result.stderr[-3000:]}")
    return result.stdout.strip()


def main():
    suffix = uuid.uuid4().hex[:8]
    projects = [f"kids-verify-src-{suffix}", f"kids-verify-dst-{suffix}"]
    directory = ROOT / ".cache" / f"restore-{suffix}"
    directory.mkdir(parents=True)
    envs = []
    for project, web_port, pg_port in zip(projects, (18080, 18081), (55433, 55434), strict=True):
        path = directory / f"{project}.env"
        path.write_text(
            f"POSTGRES_PASSWORD={secrets.token_urlsafe(18)}\nSECRET_KEY={secrets.token_hex(32)}\n"
            f"APP_ENV=development\nCOOKIE_SECURE=false\nCOMPOSE_APP_ORIGIN=http://localhost:{web_port}\n"
            f"WEB_PORT={web_port}\nPOSTGRES_PORT={pg_port}\n"
        )
        path.chmod(0o600)
        envs.append(
            {
                **os.environ,
                "COMPOSE_PROJECT_NAME": project,
                "COMPOSE_ENV_FILES": str(path),
                "COMPOSE_FILE": str(ROOT / "compose.yaml"),
            }
        )
    source, target = envs
    tags = []
    try:
        for project in projects:
            for service in ("api", "migrate", "web"):
                name = f"{project}-{service}"
                run(["docker", "tag", f"kids-todo-{service}", name])
                tags.append(name)
        run(["docker", "compose", "up", "-d", "--wait"], env=source)
        setup = """
import json
from sqlalchemy import select
from app.cli import seed_cards
from app.core import clock
from app.db.models import DailyReward, User
from app.db.session import SessionLocal
from app.modules.auth.service import passwords
from app.modules.tasks.service import save_task, complete
from app.modules.rewards.service import open_draw, select_card
with SessionLocal.begin() as db:
    seed_cards(db)
    user = User(username='verify-child',display_name='恢复验收',role='child',
                password_hash=passwords.hash('release-test-only-123'))
    db.add(user); db.flush()
    saved = save_task(db,user.id,{'name':'恢复后依然记得','rule_type':'daily','start_date':clock.today()})
    import uuid
    complete(db,user.id,uuid.UUID(saved['day']['tasks'][0]['instance_id']),True)
    reward=db.scalar(select(DailyReward))
    draw=open_draw(db,user.id,reward.id)
    record=select_card(db,user.id,uuid.UUID(draw['id']),uuid.UUID(draw['options'][0]['id']))
    print(json.dumps({'user':str(user.id),'session':draw['id'],'option':draw['options'][0]['id'],'record':record['id']}))
"""
        evidence = json.loads(
            run(["docker", "compose", "exec", "-T", "api", "python", "-"], env=source, input=setup)
        )
        with urllib.request.urlopen("http://localhost:18080/api/v1/health") as response:
            assert json.load(response)["status"] == "ok"
        run(["bash", "scripts/backup.sh", str(directory / "backup")], env=source)
        run(["docker", "compose", "up", "-d", "--wait", "db"], env=target)
        run(["bash", "scripts/restore.sh", str(directory / "backup"), "--confirm-empty-target"], env=target)
        run(["docker", "compose", "up", "-d", "--wait"], env=target)
        verify = f"""
import json, uuid
from pathlib import Path
from sqlalchemy import select,func
from app.core.config import get_settings
from app.db.models import Acquisition,MediaAsset,UserCard,DrawOption
from app.db.session import SessionLocal
from app.modules.rewards.service import select_card
evidence=json.loads({json.dumps(json.dumps(evidence))})
with SessionLocal.begin() as db:
    assert db.scalar(select(func.count()).select_from(Acquisition))==1
    assert db.scalar(select(func.count()).select_from(DrawOption))==3
    assert db.scalar(select(UserCard.quantity))==1
    assets=list(db.scalars(select(MediaAsset)))
    assert len(assets)==12
    assert all((get_settings().media_root/a.storage_key).stat().st_size==a.size_bytes for a in assets)
    replay=select_card(db,uuid.UUID(evidence['user']),uuid.UUID(evidence['session']),uuid.UUID(evidence['option']))
    assert replay['id']==evidence['record'] and replay['quantity']==1
print('恢复后数据、12张图片、候选与幂等重试一致')
"""
        print(run(["docker", "compose", "exec", "-T", "api", "python", "-"], env=target, input=verify))
        # A second restore must fail before touching a populated destination.
        rejected = subprocess.run(
            ["bash", "scripts/restore.sh", str(directory / "backup"), "--confirm-empty-target"],
            check=False,
            cwd=ROOT,
            env=target,
            capture_output=True,
            text=True,
        )
        assert rejected.returncode != 0 and "非空" in rejected.stderr
        certs = directory / "certs"
        certs.mkdir()
        run(
            [
                "openssl",
                "req",
                "-x509",
                "-newkey",
                "rsa:2048",
                "-nodes",
                "-days",
                "1",
                "-subj",
                "/CN=localhost",
                "-keyout",
                str(certs / "privkey.pem"),
                "-out",
                str(certs / "fullchain.pem"),
            ]
        )
        (certs / "privkey.pem").chmod(0o600)
        overlay = directory / "tls.yaml"
        overlay.write_text(
            "services:\n  web:\n    ports: !override\n      - '18081:80'\n      - '18443:443'\n"
            f"    volumes:\n      - {certs}:/etc/nginx/certs:ro\n"
        )
        target["COMPOSE_FILE"] = f"{ROOT}/compose.yaml:{ROOT}/compose.production.yaml:{overlay}"
        target["COMPOSE_APP_ORIGIN"] = "https://localhost:18443"
        run(["docker", "compose", "up", "-d", "--wait", "--force-recreate"], env=target)
        run(["docker", "compose", "exec", "-T", "web", "nginx", "-t"], env=target)
        context = ssl._create_unverified_context()  # disposable self-signed test certificate only
        with urllib.request.urlopen("https://localhost:18443/api/v1/health", context=context) as response:
            assert response.headers.get("Strict-Transport-Security")
            assert json.load(response)["status"] == "ok"
        browser_env = {**os.environ, "PRODUCTION_BASE_URL": "https://localhost:18443"}
        print(run(["npm", "run", "test:production"], env=browser_env, cwd=ROOT / "frontend"))
        (ROOT / ".cache/restore-verification.json").write_text(
            json.dumps(
                {
                    "database_restore": True,
                    "image_restore": 12,
                    "idempotent_replay": True,
                    "nonempty_target_rejected": True,
                    "https": True,
                    "pwa_browser_test": True,
                },
                indent=2,
            )
            + "\n"
        )
        print("Compose备份恢复、非空保护、TLS与PWA验证通过。")
    finally:
        for env in reversed(envs):
            subprocess.run(
                ["docker", "compose", "down", "-v", "--remove-orphans"],
                check=False,
                cwd=ROOT,
                env=env,
                capture_output=True,
                text=True,
            )
        for tag in tags:
            subprocess.run(["docker", "image", "rm", tag], check=False, capture_output=True, text=True)
        shutil.rmtree(directory, ignore_errors=True)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, AssertionError, OSError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
