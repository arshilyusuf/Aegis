"""
AegisAI Gateway — FastAPI Application
Main router: intercepts, analyzes, sanitizes, and optionally forwards
outgoing LLM prompts through the three-stage pipeline.
"""

from __future__ import annotations

import asyncio
import json
import time
from collections import deque
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator, Deque, Dict, List, Optional

import structlog
from fastapi import (
    FastAPI,
    HTTPException,
    Request,
    Response,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.config import get_settings
from app.database import VectorDB, load_seed_data
from app.models.embedder import Embedder
from app.models.ner_processor import NERProcessor
from app.services.cache_service import CacheService
from app.services.proxy_service import ProxyService, VERDICT_BLOCKED
from app.utils.evaluator import EVAL_FIXTURES, compute_metrics, EvalSample

logger = structlog.get_logger(__name__)
settings = get_settings()

# ── In-memory audit log (circular buffer, last 500 entries) ───────────────────
AUDIT_LOG: Deque[Dict] = deque(maxlen=500)
WEBSOCKET_CLIENTS: List[WebSocket] = []

# ── Global service singletons ─────────────────────────────────────────────────
embedder: Optional[Embedder] = None
ner: Optional[NERProcessor] = None
vector_db: Optional[VectorDB] = None
cache: Optional[CacheService] = None
proxy: Optional[ProxyService] = None


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    global embedder, ner, vector_db, cache, proxy

    logger.info("AegisAI starting up...")

    # 1. Load ML models
    embedder = Embedder(settings.embedder_model)
    ner = NERProcessor(settings.ner_model, settings.pii_regex_patterns)

    # 2. Connect Vector DB and seed
    vector_db = VectorDB(settings)
    vector_db.connect()
    vector_db.ensure_collection()

    if settings.seed_on_startup:
        seed_data = load_seed_data(settings.corporate_secrets_path)
        if seed_data:
            # Only seed if collection is empty to avoid re-seeding on restart
            if vector_db.collection_count() == 0:
                count = vector_db.upsert_assets(seed_data, embedder)
                logger.info("Vector DB seeded", count=count)
            else:
                logger.info("Vector DB already seeded — skipping")

    # 3. Connect Redis
    cache = CacheService(
        settings.redis_host,
        settings.redis_port,
        settings.redis_db,
        settings.redis_ttl_seconds,
    )
    await cache.connect()

    # 4. Initialize proxy service
    proxy = ProxyService(settings, ner, embedder, vector_db, cache)
    await proxy.startup()

    logger.info("AegisAI ready", version=settings.app_version)
    yield

    # Shutdown
    await proxy.shutdown()
    await cache.close()
    logger.info("AegisAI shut down cleanly")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Reverse-RAG Prompt Firewall & Governance Gateway",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helpers ───────────────────────────────────────────────────────────────────
async def broadcast_log(entry: Dict) -> None:
    """Push a log entry to all connected WebSocket clients."""
    if not WEBSOCKET_CLIENTS:
        return
    msg = json.dumps(entry)
    dead = []
    for ws in WEBSOCKET_CLIENTS:
        try:
            await ws.send_text(msg)
        except Exception:
            dead.append(ws)
    for ws in dead:
        WEBSOCKET_CLIENTS.remove(ws)


def extract_prompt_text(payload: Dict[str, Any]) -> str:
    """Extract the combined user prompt text from an OpenAI-style messages payload."""
    messages = payload.get("messages", [])
    parts = []
    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, str):
            parts.append(content)
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    parts.append(block.get("text", ""))
    return " ".join(parts)


# ── Request / Response models ─────────────────────────────────────────────────
class AnalyzeRequest(BaseModel):
    text: str


class PolicyUpdate(BaseModel):
    similarity_threshold: Optional[float] = None
    injection_threshold: Optional[float] = None


# ── Health ─────────────────────────────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health():
    return {
        "status": "ok",
        "version": settings.app_version,
        "vector_db_count": vector_db.collection_count() if vector_db else 0,
    }


# ── Main Intercept Endpoint (OpenAI-compatible) ───────────────────────────────
@app.post("/v1/chat/completions", tags=["Proxy"])
async def intercept_completions(request: Request) -> Response:
    """
    Drop-in replacement for OpenAI's /v1/chat/completions.
    All outgoing prompts pass through the AegisAI 3-stage pipeline.
    """
    t_entry = time.perf_counter()
    payload = await request.json()
    prompt_text = extract_prompt_text(payload)

    if not prompt_text.strip():
        raise HTTPException(status_code=400, detail="Empty prompt")

    # Run pipeline
    result = await proxy.analyze(prompt_text)

    # Build custom diagnostic headers
    extra_headers = {
        "X-AegisAI-Verdict": result.verdict,
        "X-AegisAI-RequestID": result.request_id,
        "X-AegisAI-Latency": f"{result.total_latency_ms:.0f}ms",
        "X-AegisAI-PII-Count": str(result.ner_detections.__len__()),
        "X-AegisAI-IP-Score": f"{result.ip_similarity_score:.3f}",
        "X-AegisAI-Injection-Score": f"{result.injection_score:.3f}",
        "X-AegisAI-Cache-Hit": str(result.cache_hit).lower(),
    }

    # Append to audit log
    log_entry = {
        **result.to_log_dict(),
        "timestamp": time.time(),
    }
    AUDIT_LOG.appendleft(log_entry)
    asyncio.create_task(broadcast_log(log_entry))

    if result.verdict == VERDICT_BLOCKED:
        return JSONResponse(
            status_code=403,
            content={
                "error": {
                    "type": "aegis_block",
                    "code": "content_policy_violation",
                    "message": result.block_reason
                    or "Payload blocked by AegisAI firewall.",
                    "request_id": result.request_id,
                }
            },
            headers=extra_headers,
        )

    # Rewrite the sanitized prompt into the payload
    if result.sanitized_prompt != result.original_prompt:
        sanitized_payload = dict(payload)
        # Replace last user message content with sanitized version
        msgs = sanitized_payload.get("messages", [])
        for i in range(len(msgs) - 1, -1, -1):
            if msgs[i].get("role") == "user":
                msgs[i]["content"] = result.sanitized_prompt
                break
        sanitized_payload["messages"] = msgs
    else:
        sanitized_payload = payload

    # Forward to upstream LLM
    try:
        upstream_resp = await proxy.forward_to_upstream(
            sanitized_payload, dict(request.headers)
        )
        return Response(
            content=upstream_resp.content,
            status_code=upstream_resp.status_code,
            media_type="application/json",
            headers={**dict(upstream_resp.headers), **extra_headers},
        )
    except Exception as exc:
        logger.warning("Upstream forwarding failed", error=str(exc))
        # Return sanitized payload metadata even if upstream fails
        return JSONResponse(
            status_code=200,
            content={
                "aegis_passthrough": True,
                "verdict": result.verdict,
                "sanitized_prompt": result.sanitized_prompt,
                "request_id": result.request_id,
                "upstream_error": str(exc),
            },
            headers=extra_headers,
        )


# ── Standalone Analyze Endpoint ────────────────────────────────────────────────
@app.post("/api/analyze", tags=["Analysis"])
async def analyze_text(body: AnalyzeRequest):
    """Analyze a raw text string through the full pipeline (no upstream forwarding)."""
    result = await proxy.analyze(body.text)
    log_entry = {**result.to_log_dict(), "timestamp": time.time()}
    AUDIT_LOG.appendleft(log_entry)
    asyncio.create_task(broadcast_log(log_entry))
    return {
        "request_id": result.request_id,
        "verdict": result.verdict,
        "block_reason": result.block_reason,
        "sanitized_text": result.sanitized_prompt,
        "ner_detections": result.ner_detections,
        "ip_similarity_score": result.ip_similarity_score,
        "ip_match": result.ip_match,
        "injection_score": result.injection_score,
        "cache_hit": result.cache_hit,
        "latency_ms": result.total_latency_ms,
        "stage_latencies": result.stage_latencies,
    }


# ── Audit Log ─────────────────────────────────────────────────────────────────
@app.get("/api/logs", tags=["Admin"])
async def get_logs(limit: int = 50):
    return list(AUDIT_LOG)[:limit]


# ── Analytics / Stats ──────────────────────────────────────────────────────────
@app.get("/api/stats", tags=["Admin"])
async def get_stats():
    logs = list(AUDIT_LOG)
    if not logs:
        return {"total": 0, "blocked": 0, "redacted": 0, "clear": 0, "block_rate": 0}

    total = len(logs)
    blocked = sum(1 for l in logs if l.get("verdict") == "BLOCKED")
    redacted = sum(1 for l in logs if l.get("verdict") == "REDACTED")
    clear = total - blocked - redacted
    avg_lat = sum(l.get("total_latency_ms", 0) for l in logs) / total
    cache_hits = sum(1 for l in logs if l.get("cache_hit"))

    cache_stats = await cache.get_stats() if cache else {}

    return {
        "total": total,
        "blocked": blocked,
        "redacted": redacted,
        "clear": clear,
        "block_rate": round(blocked / total, 4),
        "redact_rate": round(redacted / total, 4),
        "avg_latency_ms": round(avg_lat, 2),
        "cache_hits": cache_hits,
        "cache_hit_rate": round(cache_hits / total, 4),
        "redis_stats": cache_stats,
        "vector_db_count": vector_db.collection_count() if vector_db else 0,
    }


# ── Policy Config ─────────────────────────────────────────────────────────────
@app.get("/api/policy", tags=["Admin"])
async def get_policy():
    return {
        "similarity_threshold": settings.similarity_threshold,
        "injection_threshold": settings.injection_threshold,
        "pii_block_threshold": settings.pii_block_threshold,
        "cache_ttl_seconds": settings.redis_ttl_seconds,
    }


@app.patch("/api/policy", tags=["Admin"])
async def update_policy(update: PolicyUpdate):
    """Dynamically update detection thresholds without restart."""
    if update.similarity_threshold is not None:
        settings.similarity_threshold = update.similarity_threshold
    if update.injection_threshold is not None:
        settings.injection_threshold = update.injection_threshold
    return {"status": "updated", **await get_policy()}


# ── Evaluation Endpoint ────────────────────────────────────────────────────────
@app.post("/api/evaluate", tags=["Evaluation"])
async def run_evaluation():
    """
    Run the built-in evaluation suite through the live pipeline.
    Returns Precision, Recall, and F2-Score.
    """
    t0 = time.perf_counter()
    eval_results = []
    for fixture in EVAL_FIXTURES:
        result = await proxy.analyze(fixture.text)
        eval_results.append(
            {
                "text": fixture.text,
                "expected": fixture.expected_verdict,
                "actual": result.verdict,
                "block_reason": result.block_reason,
                "label": fixture.label,
            }
        )

    metrics = compute_metrics(eval_results)
    metrics.eval_latency_ms = round((time.perf_counter() - t0) * 1000, 2)
    return metrics.to_dict()


# ── Cache Admin ────────────────────────────────────────────────────────────────
@app.delete("/api/cache", tags=["Admin"])
async def flush_cache():
    deleted = await cache.flush_namespace()
    return {"status": "flushed", "keys_deleted": deleted}


# ── WebSocket Live Log Stream ──────────────────────────────────────────────────
@app.websocket("/ws/logs")
async def websocket_log_stream(websocket: WebSocket):
    await websocket.accept()
    WEBSOCKET_CLIENTS.append(websocket)
    # Send last 20 entries on connect
    for entry in list(AUDIT_LOG)[:20]:
        await websocket.send_text(json.dumps(entry))
    try:
        while True:
            await websocket.receive_text()  # Keep alive
    except WebSocketDisconnect:
        WEBSOCKET_CLIENTS.remove(websocket)
