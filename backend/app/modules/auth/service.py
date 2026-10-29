import hashlib
import hmac
import secrets
import uuid
from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core import clock
from app.core.config import get_settings
from app.core.errors import AppError
from app.db.models import ActivityDay, AuthSession, SessionAccount, User

passwords = PasswordHasher()
DUMMY_HASH = passwords.hash(secrets.token_urlsafe(24))


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def csrf_for(token: str) -> str:
    return hmac.new(get_settings().secret_key.encode(), token.encode(), hashlib.sha256).hexdigest()


def cookie_name(kind: str) -> str:
    prefix = "__Host-" if get_settings().cookie_secure else ""
    return f"{prefix}kids_{kind}_session"


def user_public(user: User) -> dict:
    return {
        "id": str(user.id),
        "username": user.username,
        "display_name": user.display_name,
        "avatar_key": user.avatar_key,
        "role": user.role,
        "status": user.status,
    }


def verify_password(stored: str, supplied: str) -> bool:
    try:
        return passwords.verify(stored, supplied)
    except (VerificationError, InvalidHashError):
        return False


def load_session(db: Session, request: Request, kind: str, required=True) -> AuthSession | None:
    token = request.cookies.get(cookie_name(kind), "")
    session = (
        db.scalar(
            select(AuthSession).where(AuthSession.token_hash == digest(token), AuthSession.kind == kind)
        )
        if token
        else None
    )
    stamp = clock.now()
    if session and (
        session.expires_at <= stamp
        or (kind == "admin" and session.last_seen_at + timedelta(minutes=30) <= stamp)
    ):
        session = None
    if not session and required:
        raise AppError("UNAUTHENTICATED", "请先登录", 401)
    if session:
        session.last_seen_at = stamp
    return session


def set_cookie(response: Response, session: AuthSession, token: str):
    response.set_cookie(
        cookie_name(session.kind),
        token,
        httponly=True,
        secure=get_settings().cookie_secure,
        samesite="lax",
        path="/",
        max_age=max(0, int((session.expires_at - clock.now()).total_seconds())),
    )


def create_session(db: Session, response: Response, kind: str) -> tuple[AuthSession, str]:
    token = secrets.token_urlsafe(32)
    stamp = clock.now()
    session = AuthSession(
        token_hash=digest(token),
        csrf_hash=digest(csrf_for(token)),
        kind=kind,
        expires_at=stamp + (timedelta(days=30) if kind == "child" else timedelta(hours=8)),
        last_seen_at=stamp,
    )
    db.add(session)
    db.flush()
    set_cookie(response, session, token)
    return session, token


def check_csrf(db: Session, request: Request, kind: str) -> AuthSession:
    origin = request.headers.get("origin")
    if origin != get_settings().app_origin:
        raise AppError("INVALID_ORIGIN", "请求来源无效", 403)
    session = load_session(db, request, kind)
    token = request.headers.get("x-csrf-token", "")
    if not hmac.compare_digest(digest(token), session.csrf_hash):
        raise AppError("CSRF_INVALID", "页面凭证已更新，请重试", 403)
    return session


def valid_accounts(db: Session, session: AuthSession) -> list[User]:
    return list(
        db.scalars(
            select(User)
            .join(SessionAccount)
            .where(
                SessionAccount.session_id == session.id,
                SessionAccount.credential_version == User.credential_version,
                User.status == "active",
                User.role == session.kind,
            )
            .order_by(SessionAccount.authenticated_at)
        )
    )


def login(db: Session, request: Request, response: Response, username: str, password: str, kind: str):
    session = check_csrf(db, request, kind)
    # Lock the account before changing failure counters. Authentication failures are
    # committed by the route, while business exceptions roll back their transaction.
    user = db.scalar(select(User).where(func.lower(User.username) == username.lower()).with_for_update())
    stamp = clock.now()
    if user and user.locked_until and user.locked_until > stamp:
        raise AppError("LOGIN_THROTTLED", "尝试过于频繁，请15分钟后再试", 429)
    correct = verify_password(user.password_hash if user else DUMMY_HASH, password)
    if not user or not correct or user.role != kind or user.status != "active":
        if user:
            user.failed_logins += 1
            if user.failed_logins >= 5:
                user.locked_until = stamp + timedelta(minutes=15)
                user.failed_logins = 0
        return None
    user.failed_logins = 0
    user.locked_until = None
    # Every session-list mutation takes this lock, including removal and logout.
    db.refresh(session, with_for_update=True)
    members = valid_accounts(db, session)
    existing = db.get(SessionAccount, (session.id, user.id))
    if kind == "child" and len(members) >= 10 and user.id not in {u.id for u in members}:
        raise AppError("ACCOUNT_LIMIT", "最多同时登录10个儿童账号", 409)
    if kind == "admin":
        db.execute(delete(SessionAccount).where(SessionAccount.session_id == session.id))
        existing = None
    if existing:
        existing.credential_version = user.credential_version
        existing.authenticated_at = stamp
    else:
        db.add(
            SessionAccount(
                session_id=session.id,
                user_id=user.id,
                credential_version=user.credential_version,
                authenticated_at=stamp,
            )
        )
    # Rotate the opaque token after successful authentication, retaining membership.
    token = secrets.token_urlsafe(32)
    session.token_hash = digest(token)
    session.csrf_hash = digest(csrf_for(token))
    set_cookie(response, session, token)
    db.flush()
    return {
        "user": user_public(user),
        "accounts": [user_public(u) for u in valid_accounts(db, session)],
        "csrf_token": csrf_for(token),
        "expires_at": session.expires_at,
    }


def current_user(db: Session, request: Request, kind: str) -> User:
    session = (
        check_csrf(db, request, kind)
        if request.method not in {"GET", "HEAD"}
        else load_session(db, request, kind)
    )
    members = valid_accounts(db, session)
    if kind == "admin":
        if not members:
            raise AppError("UNAUTHENTICATED", "管理员登录已失效", 401)
        return members[0]
    try:
        requested = uuid.UUID(request.headers.get("x-account-id", ""))
    except ValueError:
        raise AppError("ACCOUNT_NOT_AUTHENTICATED", "请选择已登录的儿童账号", 403) from None
    user = next((u for u in members if u.id == requested), None)
    if not user:
        raise AppError("ACCOUNT_NOT_AUTHENTICATED", "该儿童账号未登录或已失效", 403)
    stamp = clock.now()
    db.execute(
        insert(ActivityDay)
        .values(user_id=user.id, business_date=clock.today(), first_seen_at=stamp, last_seen_at=stamp)
        .on_conflict_do_update(
            index_elements=[ActivityDay.user_id, ActivityDay.business_date], set_={"last_seen_at": stamp}
        )
    )
    return user
