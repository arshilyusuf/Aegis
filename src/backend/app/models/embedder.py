"""
AegisAI Embedder Module
Generates 384-dimensional sentence embeddings using all-MiniLM-L6-v2.
Optimized for batch encoding and async-safe operation on CPU.
"""

from __future__ import annotations

import time
import numpy as np
import structlog
from typing import List, Union

logger = structlog.get_logger(__name__)


class Embedder:
    """
    Wraps SentenceTransformer all-MiniLM-L6-v2 for fast CPU inference.
    The model is loaded once at startup and reused across all requests.
    """

    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
        self._model_name = model_name
        self._model = None
        self._load()

    def _load(self) -> None:
        from sentence_transformers import SentenceTransformer

        logger.info("Loading sentence embedder", model=self._model_name)
        self._model = SentenceTransformer(self._model_name, device="cpu")
        logger.info("Embedder ready", model=self._model_name, dim=self.vector_dim)

    @property
    def vector_dim(self) -> int:
        if self._model is None:
            return 384
        return self._model.get_sentence_embedding_dimension()

    def encode(self, text: Union[str, List[str]]) -> np.ndarray:
        """Encode one or more texts. Returns float32 ndarray of shape (N, dim)."""
        t0 = time.perf_counter()
        texts = [text] if isinstance(text, str) else text

        vectors = self._model.encode(
            texts,
            normalize_embeddings=True,  # L2-normalize for cosine via dot product
            batch_size=32,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        elapsed = (time.perf_counter() - t0) * 1000
        logger.debug(
            "Embedding complete", texts=len(texts), latency_ms=round(elapsed, 2)
        )
        return vectors.astype(np.float32)

    def encode_single(self, text: str) -> List[float]:
        """Encode a single text and return as a plain Python list (for Qdrant)."""
        return self.encode(text)[0].tolist()

    def cosine_similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        """Compute cosine similarity between two normalized vectors (dot product)."""
        a = np.array(vec_a, dtype=np.float32)
        b = np.array(vec_b, dtype=np.float32)
        return float(np.dot(a, b))
