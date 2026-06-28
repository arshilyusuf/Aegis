"""
AegisAI Cache Service
Redis-powered semantic caching layer.
Cache keys are SHA-256 hashes of quantized prompt vectors, enabling
near-duplicate prompt detection without rerunning the full ML pipeline.
"""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any, Dict, Optional

import redis.asyncio as aioredis
import structlog

logger = structlog.get_logger(__name__)


class CacheService:
    def __init__(self, host: str, port: int, db: int, ttl: int):
        self._host = host
        self._port = port
        self._db = db
        self._ttl = ttl
        self._client: Optional[aioredis.Redis] = None

    async def connect(self) -> None:
            self._client = aioredis.Redis(
                host=self._host,
                port=self._port,
                db=self._db,
                decode_responses=True,
            )
            try:
                await self._client.ping()
                logger.info("Redis cache connected", host=self._host, port=self._port)
            except Exception:
                logger.warning("Redis server not detected. Falling back to Mock Cache layer for local testing.")
                self._client = None
    async def close(self) -> None:
        if self._client:
            await self._client.close()

    def _vector_cache_key(self, vector: list[float]) -> str:
        """
        Create a deterministic cache key from a float vector.
        Quantizes to 3 decimal places to allow near-duplicate collisions.
        """
        quantized = [round(v, 3) for v in vector]
        key_str = json.dumps(quantized, separators=(",", ":"))
        digest = hashlib.sha256(key_str.encode()).hexdigest()[:32]
        return f"aegis:vec:{digest}"

    def _text_cache_key(self, text: str) -> str:
        digest = hashlib.sha256(text.encode()).hexdigest()[:32]
        return f"aegis:txt:{digest}"

    async def get_verdict(self, vector: list[float]) -> Optional[Dict[str, Any]]:
        """Retrieve a cached security verdict by prompt vector."""
        if not self._client:
            return None
        try:
            key = self._vector_cache_key(vector)
            data = await self._client.get(key)
            if data:
                logger.debug("Cache HIT", key=key)
                return json.loads(data)
        except Exception as exc:
            logger.warning("Cache GET error", error=str(exc))
        return None

    async def set_verdict(self, vector: list[float], verdict: Dict[str, Any]) -> None:
        """Store a security verdict keyed by prompt vector."""
        if not self._client:
            return
        try:
            key = self._vector_cache_key(vector)
            await self._client.setex(key, self._ttl, json.dumps(verdict))
            logger.debug("Cache SET", key=key, ttl=self._ttl)
        except Exception as exc:
            logger.warning("Cache SET error", error=str(exc))

    async def get_stats(self) -> Dict[str, Any]:
        """Return Redis INFO stats relevant to cache health."""
        if not self._client:
            return {}
        try:
            info = await self._client.info("stats")
            return {
                "hits": info.get("keyspace_hits", 0),
                "misses": info.get("keyspace_misses", 0),
                "total_commands": info.get("total_commands_processed", 0),
            }
        except Exception:
            return {}

    async def flush_namespace(self, namespace: str = "aegis:*") -> int:
        """Delete all AegisAI cache keys (for admin resets)."""
        if not self._client:
            return 0
        keys = await self._client.keys(namespace)
        if keys:
            await self._client.delete(*keys)
        return len(keys)
