"""
AegisAI NER Processor
Stage 1: Named Entity Recognition + Regex PII masking pipeline.
Uses a quantized Transformer for token classification, supplemented by
deterministic regex patterns for high-confidence structural PII.
"""

from __future__ import annotations

import re
import time
import logging
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import structlog

logger = structlog.get_logger(__name__)

# ── Redaction token templates ─────────────────────────────────────────────────
REDACTION_MAP = {
    "EMAIL": "[REDACTED_EMAIL]",
    "PHONE": "[REDACTED_PHONE]",
    "SSN": "[REDACTED_SSN]",
    "CREDIT_CARD": "[REDACTED_CARD]",
    "API_KEY": "[REDACTED_API_KEY]",
    "IP_ADDRESS": "[REDACTED_IP]",
    "AWS_KEY": "[REDACTED_AWS_KEY]",
    "JWT": "[REDACTED_JWT]",
    "PER": "[REDACTED_PERSON]",
    "ORG": "[REDACTED_ORG]",
    "LOC": "[REDACTED_LOCATION]",
    "MISC": "[REDACTED_ENTITY]",
}


@dataclass
class NERResult:
    original_text: str
    sanitized_text: str
    detections: List[Dict] = field(default_factory=list)
    redaction_count: int = 0
    processing_ms: float = 0.0
    has_pii: bool = False


class NERProcessor:
    """
    Two-layer PII/entity detection:
      Layer A — Deterministic regex (fast, zero latency structural PII)
      Layer B — Transformer NER model (contextual entity recognition)
    """

    def __init__(self, model_name: str, pii_regex_patterns: dict):
        self._model_name = model_name
        self._regex_patterns = {
            name: re.compile(pattern, re.IGNORECASE)
            for name, pattern in pii_regex_patterns.items()
        }
        self._pipeline = None
        self._load_model()

    def _load_model(self) -> None:
        """Load HuggingFace NER pipeline. Falls back gracefully if unavailable."""
        try:
            from transformers import (
                pipeline,
                AutoTokenizer,
                AutoModelForTokenClassification,
            )

            logger.info("Loading NER model", model=self._model_name)
            self._pipeline = pipeline(
                "ner",
                model=self._model_name,
                aggregation_strategy="simple",
                device=-1,  # CPU
            )
            logger.info("NER model loaded successfully", model=self._model_name)
        except Exception as exc:
            logger.warning(
                "NER model load failed — regex-only mode active",
                error=str(exc),
            )
            self._pipeline = None

    def _apply_regex_layer(self, text: str) -> Tuple[str, List[Dict]]:
        """Layer A: Apply deterministic regex patterns."""
        detections: List[Dict] = []
        sanitized = text

        for entity_type, pattern in self._regex_patterns.items():
            matches = list(pattern.finditer(sanitized))
            for match in reversed(matches):  # Reverse to preserve offsets
                original = match.group()
                replacement = REDACTION_MAP.get(entity_type, "[REDACTED]")
                detections.append(
                    {
                        "layer": "regex",
                        "entity_type": entity_type,
                        "original": (
                            original[:20] + "..." if len(original) > 20 else original
                        ),
                        "replacement": replacement,
                        "start": match.start(),
                        "end": match.end(),
                        "confidence": 1.0,
                    }
                )
                sanitized = (
                    sanitized[: match.start()] + replacement + sanitized[match.end() :]
                )

        return sanitized, detections

    def _apply_transformer_layer(self, text: str) -> Tuple[str, List[Dict]]:
        """Layer B: Transformer-based contextual NER."""
        if not self._pipeline:
            return text, []

        try:
            # Truncate to avoid token limits on very long prompts
            truncated = text[:1024]
            ner_results = self._pipeline(truncated)
            detections: List[Dict] = []
            sanitized = text

            # Sort by start index descending to safely replace without offset drift
            sorted_results = sorted(ner_results, key=lambda x: x["start"], reverse=True)

            for entity in sorted_results:
                entity_group = entity.get("entity_group", entity.get("entity", "MISC"))
                # Normalise B-/I- prefixes
                for prefix in ("B-", "I-"):
                    if entity_group.startswith(prefix):
                        entity_group = entity_group[len(prefix) :]

                replacement = REDACTION_MAP.get(entity_group, "[REDACTED_ENTITY]")
                start, end = entity["start"], entity["end"]

                detections.append(
                    {
                        "layer": "transformer",
                        "entity_type": entity_group,
                        "original": entity.get("word", "")[:20],
                        "replacement": replacement,
                        "start": start,
                        "end": end,
                        "confidence": round(float(entity.get("score", 0)), 4),
                    }
                )

                sanitized = sanitized[:start] + replacement + sanitized[end:]

            return sanitized, detections

        except Exception as exc:
            logger.warning("Transformer NER failed", error=str(exc))
            return text, []

    def process(self, text: str) -> NERResult:
        """Run full two-layer PII pipeline and return NERResult."""
        t0 = time.perf_counter()

        # Layer A — regex
        stage1_text, regex_detections = self._apply_regex_layer(text)

        # Layer B — transformer
        stage2_text, transformer_detections = self._apply_transformer_layer(stage1_text)

        all_detections = regex_detections + transformer_detections
        processing_ms = (time.perf_counter() - t0) * 1000

        return NERResult(
            original_text=text,
            sanitized_text=stage2_text,
            detections=all_detections,
            redaction_count=len(all_detections),
            processing_ms=round(processing_ms, 2),
            has_pii=len(all_detections) > 0,
        )
