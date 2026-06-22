import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse

from core.config import settings
from core.database import init_db, seed_dev_users
from routers import analyze, profile, auth, admin, hardware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed_dev_users()
    yield


app = FastAPI(
    title="กินเลย — Backend API",
    description="Gemini-powered food safety analysis for Loei province",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analyze.router)
app.include_router(profile.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(hardware.router)
app.include_router(hardware.result_router)   # /result/{device_id} ไม่มี prefix


@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = time.time()
    response = await call_next(request)
    ms = (time.time() - t0) * 1000
    logging.getLogger("kinloei.http").info(
        f"{request.method} {request.url.path}  → {response.status_code}  ({ms:.0f}ms)"
    )
    return response


@app.get("/ping", response_class=PlainTextResponse)
async def ping():
    return "pong"


@app.get("/health")
async def health():
    return {"status": "ok", "service": "กินเลย-backend", "version": "1.0.0"}
