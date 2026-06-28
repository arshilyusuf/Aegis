"""
AegisAI Proxy Service
Core three-stage pipeline orchestrator and upstream LLM forwarder.

Pipeline:
  Stage 1 → NER + Regex PII Masking
  Stage 2 → Reverse-RAG IP Exfiltration Detection
  Stage 3 → Prompt Injection Classification
  Forward  → httpx async upstream call (if payload clears all stages)
"""

from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional

import httpx
import structlog

from app.models.ner_processor import NERProcessor, NERResult
from app.models.embedder import Embedder
from app.database import VectorDB
from app.services.cache_service import CacheService
from app.config import Settings

logger = structlog.get_logger(__name__)

# ── Verdict constants ──────────────────────────────────────────────────────────
VERDICT_CLEAR = "CLEAR"
VERDICT_REDACTED = "REDACTED"
VERDICT_BLOCKED = "BLOCKED"


@dataclass
class PipelineResult:
    request_id: str
    verdict: str  # CLEAR | REDACTED | BLOCKED
    block_reason: Optional[str]  # Human-readable block cause
    original_prompt: str
    sanitized_prompt: str
    ner_detections: List[Dict]
    ip_similarity_score: float
    ip_match: Optional[Dict]
    injection_score: float
    cache_hit: bool
    total_latency_ms: float
    stage_latencies: Dict[str, float] = field(default_factory=dict)

    def to_log_dict(self) -> Dict:
        d = asdict(self)
        d["original_prompt"] = (
            d["original_prompt"][:120] + "..."
            if len(d["original_prompt"]) > 120
            else d["original_prompt"]
        )
        return d


# ── Injection classifier (lightweight zero-shot) ──────────────────────────────
class InjectionClassifier:
    """
    Uses zero-shot NLI to detect prompt injection / jailbreak attempts.
    Falls back to keyword heuristics if model unavailable.
    """

    INJECTION_KEYWORDS = [
        "ignore previous instructions",
        "forget your system prompt",
        "you are now",
        "disregard all prior",
        "act as if you have no restrictions",
        "pretend you are",
        "your new instructions are",
        "override safety",
        "bypass your filter",
        "jailbreak",
        "DAN mode",
        "developer mode enabled",
        "sudo mode",
        "unrestricted mode",
        "ignore all rules",
    ]

    def __init__(self, model_name: str):
        self._model_name = model_name
        self._pipeline = None
        self._load()

    def _load(self) -> None:
        try:
            from transformers import pipeline

            self._pipeline = pipeline(
                "zero-shot-classification",
                model=self._model_name,
                device=-1,
            )
            logger.info("Injection classifier loaded", model=self._model_name)
        except Exception as exc:
            logger.warning(
                "Injection classifier unavailable — heuristic mode", error=str(exc)
            )

    def score(self, text: str) -> float:
        """Return injection probability in [0, 1]."""
        text_lower = text.lower()

        # Fast keyword heuristic
        keyword_hits = sum(1 for kw in self.INJECTION_KEYWORDS if kw in text_lower)
        if keyword_hits > 0:
            return min(0.5 + keyword_hits * 0.15, 1.0)

        if self._pipeline:
            try:
                result = self._pipeline(
                    text[:512],
                    candidate_labels=["prompt injection", "normal instruction"],
                    hypothesis_template="This text is {}.",
                )
                labels = result["labels"]
                scores = result["scores"]
                injection_score = scores[labels.index("prompt injection")]
                return round(injection_score, 4)
            except Exception as exc:
                logger.warning("Injection classifier inference failed", error=str(exc))

        return 0.0


# ── Main Proxy Service ─────────────────────────────────────────────────────────
class ProxyService:
    def __init__(
        self,
        settings: Settings,
        ner: NERProcessor,
        embedder: Embedder,
        vector_db: VectorDB,
        cache: CacheService,
    ):
        self._settings = settings
        self._ner = ner
        self._embedder = embedder
        self._vector_db = vector_db
        self._cache = cache
        self._injection_classifier = InjectionClassifier(
            settings.injection_classifier_model
        )
        self._http_client: Optional[httpx.AsyncClient] = None

    async def startup(self) -> None:
        self._http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(self._settings.upstream_timeout_s),
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
        )

    async def shutdown(self) -> None:
        if self._http_client:
            await self._http_client.aclose()

    # ── Stage 1: NER ──────────────────────────────────────────────────────────
    async def _stage_ner(self, text: str):
        loop = asyncio.get_event_loop()
        result: NERResult = await loop.run_in_executor(None, self._ner.process, text)
        return result

    # ── Stage 2: Reverse-RAG ──────────────────────────────────────────────────
    async def _stage_reverse_rag(self, text: str):
        loop = asyncio.get_event_loop()
        vector = await loop.run_in_executor(None, self._embedder.encode_single, text)
        hits = await loop.run_in_executor(
            None,
            lambda: self._vector_db.similarity_search(
                vector,
                top_k=1,
                score_threshold=0.0,
            ),
        )
        top_score = hits[0]["score"] if hits else 0.0
        top_match = hits[0] if hits else None
        return vector, top_score, top_match

    # ── Stage 3: Injection ────────────────────────────────────────────────────
    async def _stage_injection(self, text: str) -> float:
        loop = asyncio.get_event_loop()
        score = await loop.run_in_executor(None, self._injection_classifier.score, text)
        return score

    # ── Full Pipeline ─────────────────────────────────────────────────────────
    async def analyze(self, prompt_text: str) -> PipelineResult:
        t_total = time.perf_counter()
        request_id = str(uuid.uuid4())[:8]
        stage_latencies: Dict[str, float] = {}

        # ── Stage 1: NER ──────────────────────────────────────────────────────
        t0 = time.perf_counter()
        ner_result = await self._stage_ner(prompt_text)
        stage_latencies["ner_ms"] = round((time.perf_counter() - t0) * 1000, 2)
        sanitized = ner_result.sanitized_text

        # ── Embed sanitized text for stages 2 & cache ─────────────────────────
        t0 = time.perf_counter()
        loop = asyncio.get_event_loop()
        vector = await loop.run_in_executor(
            None, self._embedder.encode_single, sanitized
        )
        stage_latencies["embed_ms"] = round((time.perf_counter() - t0) * 1000, 2)

        # ── Cache check ───────────────────────────────────────────────────────
        cached = await self._cache.get_verdict(vector)
        if cached:
            # Reconstruct result from cache; update prompt references
            return PipelineResult(
                request_id=request_id,
                verdict=cached["verdict"],
                block_reason=cached.get("block_reason"),
                original_prompt=prompt_text,
                sanitized_prompt=sanitized,
                ner_detections=cached.get("ner_detections", []),
                ip_similarity_score=cached.get("ip_similarity_score", 0.0),
                ip_match=cached.get("ip_match"),
                injection_score=cached.get("injection_score", 0.0),
                cache_hit=True,
                total_latency_ms=round((time.perf_counter() - t_total) * 1000, 2),
                stage_latencies={"cache_hit": True},
            )

        # ── Stage 2: Reverse-RAG ──────────────────────────────────────────────
        t0 = time.perf_counter()
        _, ip_score, ip_match = await self._stage_reverse_rag(sanitized)
        stage_latencies["reverse_rag_ms"] = round((time.perf_counter() - t0) * 1000, 2)

        # ── Stage 3: Prompt Injection ─────────────────────────────────────────
        t0 = time.perf_counter()
        injection_score = await self._stage_injection(prompt_text)
        stage_latencies["injection_ms"] = round((time.perf_counter() - t0) * 1000, 2)

        # ── Verdict Logic ──────────────────────────────────────────────────────
        verdict = VERDICT_CLEAR
        block_reason = None

        if injection_score >= self._settings.injection_threshold:
            verdict = VERDICT_BLOCKED
            block_reason = f"Prompt injection detected (score={injection_score:.3f})"
        elif ip_score >= self._settings.similarity_threshold:
            verdict = VERDICT_BLOCKED
            block_reason = (
                f"IP exfiltration risk: similarity={ip_score:.3f} to "
                f"asset '{ip_match['payload'].get('name', 'UNKNOWN')}'"
            )
        elif ner_result.has_pii:
            verdict = VERDICT_REDACTED

        total_ms = round((time.perf_counter() - t_total) * 1000, 2)
        result = PipelineResult(
            request_id=request_id,
            verdict=verdict,
            block_reason=block_reason,
            original_prompt=prompt_text,
            sanitized_prompt=sanitized,
            ner_detections=ner_result.detections,
            ip_similarity_score=ip_score,
            ip_match=ip_match,
            injection_score=injection_score,
            cache_hit=False,
            total_latency_ms=total_ms,
            stage_latencies=stage_latencies,
        )

        # ── Cache the verdict ─────────────────────────────────────────────────
        await self._cache.set_verdict(
            vector,
            {
                "verdict": verdict,
                "block_reason": block_reason,
                "ner_detections": ner_result.detections,
                "ip_similarity_score": ip_score,
                "ip_match": ip_match,
                "injection_score": injection_score,
            },
        )

        logger.info("Pipeline complete", **result.to_log_dict())
        return result

    async def forward_to_upstream(
        self,
        sanitized_payload: Dict[str, Any],
        original_headers: Dict[str, str],
    ) -> httpx.Response:
        """Forward sanitized payload to upstream LLM API."""
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._settings.upstream_api_key}",
        }
        upstream_url = f"{self._settings.upstream_llm_url}/v1/chat/completions"
        response = await self._http_client.post(
            upstream_url,
            json=sanitized_payload,
            headers=headers,
        )
        return response
