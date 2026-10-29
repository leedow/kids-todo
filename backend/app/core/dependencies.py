from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.db.models import User
from app.db.session import get_db
from app.modules.auth.service import current_user

DB = Annotated[Session, Depends(get_db, scope="function")]


def child(request: Request, db: DB) -> User:
    return current_user(db, request, "child")


def administrator(request: Request, db: DB) -> User:
    return current_user(db, request, "admin")


Child = Annotated[User, Depends(child, scope="function")]
Admin = Annotated[User, Depends(administrator, scope="function")]
