import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.config import get_settings
from app.core.dependencies import DB
from app.core.errors import AppError
from app.modules.admin.router import router as admin_router
from app.modules.auth.router import router as auth_router
from app.modules.cards.router import router as cards_router
from app.modules.rewards.router import router as rewards_router
from app.modules.tasks.router import router as tasks_router

logger = logging.getLogger("kids-todo")


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_settings().media_root.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="小小成长家 API", version="0.1.0", lifespan=lifespan)


@app.middleware("http")
async def response_headers(request: Request, call_next):
    request.state.request_id = uuid.uuid4().hex
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    if request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store"
    return response


def error_response(request: Request, code: str, message: str, status: int, **extra):
    headers = {"Retry-After": "900"} if status == 429 else None
    return JSONResponse(
        {"error": {"code": code, "message": message, "request_id": request.state.request_id, **extra}},
        status_code=status,
        headers=headers,
    )


@app.exception_handler(AppError)
async def business_error(request: Request, exc: AppError):
    return error_response(request, exc.code, exc.message, exc.status)


@app.exception_handler(RequestValidationError)
@app.exception_handler(ValidationError)
async def validation_error(request: Request, exc):
    fields = [{"loc": e["loc"], "message": e["msg"], "type": e["type"]} for e in exc.errors()]
    return error_response(request, "VALIDATION_ERROR", "请检查填写内容", 422, fields=fields)


@app.exception_handler(IntegrityError)
async def integrity_error(request: Request, exc: IntegrityError):
    return error_response(request, "CONFLICT", "数据已发生变化，请刷新后再试", 409)


@app.get("/api/v1/health")
def health(db: DB):
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


for router in (auth_router, tasks_router, cards_router, rewards_router, admin_router):
    app.include_router(router, prefix="/api/v1")

app.mount("/media", StaticFiles(directory=str(get_settings().media_root), check_dir=False), name="media")
