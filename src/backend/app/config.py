"""
AegisAI Configuration Module
Centralised environment variable management with typed Pydantic settings.
"""

from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── Application ───────────────────────────────────────────────────────────
    app_name: str = "AegisAI Gateway"
    app_version: str = "1.0.0"
    log_level: str = "info"
    debug: bool = False

    # ── Upstream LLM ──────────────────────────────────────────────────────────
    upstream_llm_url: str = "https://api.openai.com"
    upstream_api_key: str = "sk-placeholder"
    upstream_timeout_s: int = 30

    # ── Qdrant Vector DB ──────────────────────────────────────────────────────
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    qdrant_collection: str = "corporate_assets"
    qdrant_vector_size: int = 384

    # ── Redis ─────────────────────────────────────────────────────────────────
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    redis_ttl_seconds: int = 3600  # Cache TTL: 1 hour
    cache_similarity_threshold: float = 0.98  # Threshold for cache hit

    # ── Security Thresholds ───────────────────────────────────────────────────
    # Reverse-RAG: block if cosine similarity to corporate asset >= this value
    similarity_threshold: float = 0.82
    # Prompt injection classifier: block if score >= this value
    injection_threshold: float = 0.75
    # Redact PII but forward if below block threshold
    pii_block_threshold: float = (
        0.95  # If NER confidence >= this, also block (not just redact)
    )

    # ── ML Model Identifiers ──────────────────────────────────────────────────
    embedder_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    ner_model: str = "elastic/distilbert-base-uncased-finetuned-conll03-english"
    # Fallback HF model for injection detection (zero-shot)
    injection_classifier_model: str = "cross-encoder/nli-deberta-v3-small"

    # ── Seed Data ─────────────────────────────────────────────────────────────
    seed_on_startup: bool = True
    corporate_secrets_path: str = "data/corporate_secrets.json"

    # ── CORS ──────────────────────────────────────────────────────────────────
    allowed_origins: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    # ── PII Regex Patterns (supplemental to NER) ──────────────────────────────
    # These fire as a fast pre-scan before the NER model
    pii_regex_patterns: dict = {
        "EMAIL": r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
        "PHONE": r"(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}",
        "SSN": r"\b\d{3}-\d{2}-\d{4}\b",
        "CREDIT_CARD": r"\b(?:\d{4}[-\s]?){3}\d{4}\b",
        "API_KEY": r"\b(sk-|pk-|api-|key-)[a-zA-Z0-9]{20,}\b",
        "IP_ADDRESS": r"\b(?:\d{1,3}\.){3}\d{1,3}\b",
        "AWS_KEY": r"AKIA[0-9A-Z]{16}",
        "JWT": r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}",
    }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
