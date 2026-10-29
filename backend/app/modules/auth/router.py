import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.core.schema import AccountsPublic
from app.db.models import SessionAccount
from app.db.session import get_db
from app.modules.auth import service

router = APIRouter()
DB = Annotated[Session, Depends(get_db, scope="function")]


class Credentials(BaseModel):
    username: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=128)


@router.get("/auth/csrf")
def csrf(request: Request, response: Response, db: DB, scope: Literal["child", "admin"] = "child"):
    session = service.load_session(db, request, scope, required=False)
    if session:
        token = request.cookies[service.cookie_name(scope)]
        session.csrf_hash = service.digest(service.csrf_for(token))
    else:
        session, token = service.create_session(db, response, scope)
    return {"csrf_token": service.csrf_for(token)}


def do_login(payload: Credentials, request: Request, response: Response, db: Session, kind: str):
    result = service.login(db, request, response, payload.username, payload.password, kind)
    if result is None:
        # Commit failure counters without returning credentials or rolling them back.
        response.status_code = 401
        return {
            "error": {
                "code": "INVALID_CREDENTIALS",
                "message": "账号或密码不正确",
                "request_id": request.state.request_id,
            }
        }
    return result


@router.post("/auth/accounts")
def child_login(payload: Credentials, request: Request, response: Response, db: DB):
    return do_login(payload, request, response, db, "child")


@router.get("/auth/accounts", response_model=AccountsPublic)
def accounts(request: Request, db: DB):
    session = service.load_session(db, request, "child", required=False)
    return {
        "accounts": [service.user_public(u) for u in service.valid_accounts(db, session)] if session else []
    }


@router.delete("/auth/accounts/{user_id}", status_code=204)
def remove(user_id: uuid.UUID, request: Request, db: DB):
    session = service.check_csrf(db, request, "child")
    db.refresh(session, with_for_update=True)
    member = db.get(SessionAccount, (session.id, user_id))
    if not member:
        raise AppError("NOT_FOUND", "账号未登录", 404)
    db.delete(member)


def logout(request: Request, response: Response, db: Session, kind: str):
    session = service.check_csrf(db, request, kind)
    db.refresh(session, with_for_update=True)
    db.execute(delete(SessionAccount).where(SessionAccount.session_id == session.id))
    db.delete(session)
    response.delete_cookie(
        service.cookie_name(kind),
        path="/",
        secure=service.get_settings().cookie_secure,
        httponly=True,
        samesite="lax",
    )


@router.post("/auth/logout", status_code=204)
def child_logout(request: Request, response: Response, db: DB):
    logout(request, response, db, "child")


@router.post("/admin/auth/login")
def admin_login(payload: Credentials, request: Request, response: Response, db: DB):
    return do_login(payload, request, response, db, "admin")


@router.post("/admin/auth/logout", status_code=204)
def admin_logout(request: Request, response: Response, db: DB):
    logout(request, response, db, "admin")
