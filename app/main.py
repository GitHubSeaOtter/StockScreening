"""株スクリーニングアプリ - FastAPI バックエンド。

起動: uvicorn app.main:app --host 0.0.0.0 --port 8000
iPhone のブラウザから http://<PCのIPアドレス>:8000/ でアクセスする。
"""
from __future__ import annotations

import dataclasses
import logging
import threading
import uuid
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import data_fetcher, llm_parser, market_calendar, screener

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="株スクリーニング")

STATIC_DIR = Path(__file__).resolve().parent / "static"

# ---- 簡易ジョブ管理(スクリーニングは数分かかるため非同期実行) ----
_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()


class ScreenRequest(BaseModel):
    categories: list[str] = Field(default=["stock"])  # stock / etf / trust
    conditions: list[dict] = Field(default_factory=list)
    max_tickers: int | None = None  # デバッグ・時間短縮用。None なら全銘柄


class ParseRequest(BaseModel):
    text: str


class ApiKeyRequest(BaseModel):
    api_key: str


@app.get("/")
def index():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/base_date")
def get_base_date():
    return {"base_date": market_calendar.base_date().isoformat()}


@app.get("/api/universe")
def get_universe():
    df = data_fetcher.fetch_ticker_list()
    counts = df["category"].value_counts().to_dict()
    return {"total": len(df), "counts": counts}


@app.post("/api/screen")
def start_screen(req: ScreenRequest):
    if not req.conditions:
        raise HTTPException(400, "条件を1つ以上指定してください")
    job_id = uuid.uuid4().hex[:12]
    with _jobs_lock:
        _jobs[job_id] = {"status": "running", "progress": 0, "total": 0, "results": None, "error": None}
    threading.Thread(target=_run_screen, args=(job_id, req), daemon=True).start()
    return {"job_id": job_id}


@app.get("/api/screen/{job_id}")
def get_screen(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
    if job is None:
        raise HTTPException(404, "ジョブが見つかりません")
    return job


def _run_screen(job_id: str, req: ScreenRequest):
    def progress(done: int, total: int):
        with _jobs_lock:
            _jobs[job_id]["progress"] = done
            _jobs[job_id]["total"] = total

    try:
        base = market_calendar.base_date()
        meta = data_fetcher.fetch_ticker_list()
        meta = meta[meta["category"].isin(req.categories)]
        tickers = meta["ticker"].tolist()
        if req.max_tickers:
            tickers = tickers[: req.max_tickers]
        with _jobs_lock:
            _jobs[job_id]["total"] = len(tickers)

        prices = data_fetcher.fetch_prices(tickers, base, progress_cb=progress)
        results = screener.screen(prices, meta, base, req.conditions)
        with _jobs_lock:
            _jobs[job_id].update(
                status="done",
                base_date=base.isoformat(),
                results=[dataclasses.asdict(r) for r in results],
            )
    except Exception as e:  # ジョブ内例外はステータスで返す
        logger.exception("スクリーニング失敗")
        with _jobs_lock:
            _jobs[job_id].update(status="error", error=str(e))


@app.post("/api/parse_condition")
def parse_condition(req: ParseRequest):
    try:
        conditions = llm_parser.parse_natural_language(req.text)
    except RuntimeError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.exception("条件パース失敗")
        raise HTTPException(500, f"変換に失敗しました: {e}")
    return {"conditions": conditions}


@app.get("/api/settings")
def get_settings():
    return {"has_api_key": llm_parser.has_api_key()}


@app.post("/api/settings")
def set_settings(req: ApiKeyRequest):
    llm_parser.save_api_key(req.api_key.strip())
    return {"ok": True}
