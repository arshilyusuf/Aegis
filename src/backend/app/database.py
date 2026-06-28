"""
AegisAI Vector Database Module
Manages Qdrant connection, collection lifecycle, and seeding of corporate assets.
"""

from __future__ import annotations

import json
import uuid
import asyncio
import structlog
from pathlib import Path
from typing import List, Dict, Optional, Tuple

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    PointStruct,
    SearchRequest,
    Filter,
)

from app.config import Settings

logger = structlog.get_logger(__name__)


class VectorDB:
    """
    Qdrant wrapper providing:
     - Collection creation / recreation
     - Upsert of corporate asset fingerprints
     - Semantic similarity search
    """

    def __init__(self, settings: Settings):
        self._settings = settings
        self._client: Optional[QdrantClient] = None
        self._collection = settings.qdrant_collection
        self._vector_size = settings.qdrant_vector_size

    def connect(self) -> None:
        """Establish Qdrant client connection."""
        self._client = QdrantClient(
            host=self._settings.qdrant_host,
            port=self._settings.qdrant_port,
            timeout=10,
        )
        logger.info(
            "Qdrant connected",
            host=self._settings.qdrant_host,
            port=self._settings.qdrant_port,
        )

    def ensure_collection(self) -> None:
        """Create collection if it does not exist."""
        existing = [c.name for c in self._client.get_collections().collections]
        if self._collection not in existing:
            self._client.create_collection(
                collection_name=self._collection,
                vectors_config=VectorParams(
                    size=self._vector_size,
                    distance=Distance.COSINE,
                ),
            )
            logger.info("Collection created", collection=self._collection)
        else:
            logger.info("Collection exists", collection=self._collection)

    def upsert_assets(self, assets: List[Dict], embedder) -> int:
        """
        Upsert a list of corporate asset dicts into Qdrant.
        Each asset must have a 'content' field; all other fields become payload.
        """
        points: List[PointStruct] = []
        texts = [a["content"] for a in assets]
        vectors = embedder.encode(texts)

        for i, (asset, vector) in enumerate(zip(assets, vectors)):
            payload = {k: v for k, v in asset.items() if k != "content"}
            payload["content_preview"] = asset["content"][:200]
            points.append(
                PointStruct(
                    id=str(uuid.uuid5(uuid.NAMESPACE_URL, asset["content"])),
                    vector=vector.tolist(),
                    payload=payload,
                )
            )

        self._client.upsert(collection_name=self._collection, points=points, wait=True)
        logger.info("Assets upserted", count=len(points), collection=self._collection)
        return len(points)

    def similarity_search(
        self,
        query_vector: List[float],
        top_k: int = 3,
        score_threshold: float = 0.0,
    ) -> List[Dict]:
        """
        Query the vector DB and return matches above score_threshold.
        Returns list of {score, payload} dicts sorted by score descending.
        """
        response = self._client.query_points(
            collection_name=self._collection,
            query=query_vector,
            limit=top_k,
            score_threshold=score_threshold,
            with_payload=True,
        )
        hits = []
        for r in response.points:
            hits.append(
                {
                    "score": round(r.score, 4),
                    "id": str(r.id),
                    "payload": r.payload,
                }
            )
        return hits

    def collection_count(self) -> int:
        info = self._client.get_collection(self._collection)
        return info.points_count


def load_seed_data(path: str) -> List[Dict]:
    """Load and validate the corporate_secrets.json seed file."""
    p = Path(path)
    if not p.exists():
        logger.warning("Seed file not found", path=path)
        return []
    with open(p, "r", encoding="utf-8") as f:
        data = json.load(f)
    logger.info("Seed data loaded", path=path, count=len(data))
    return data
