"""
AegisAI Data Ingestion Pipeline
Streams ai4privacy/pii-masking-300k from Hugging Face, batches embeddings,
and upserts to Qdrant without overloading local RAM.
"""

import time
import uuid
import structlog
from typing import Iterator, List, Dict
from datasets import load_dataset
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct
from sentence_transformers import SentenceTransformer

logger = structlog.get_logger(__name__)

# Configuration
HF_DATASET = "ai4privacy/pii-masking-300k"
QDRANT_HOST = "qdrant"
QDRANT_PORT = 6333
COLLECTION_NAME = "corporate_assets"
BATCH_SIZE = 256
MAX_RECORDS = 50000  # Adjust based on your final-year project requirements


def batched_dataset(dataset, batch_size: int) -> Iterator[List[Dict]]:
    """Yields batches of records from the dataset to manage RAM."""
    batch = []
    for record in dataset:
        batch.append(record)
        if len(batch) >= batch_size:
            yield batch
            batch = []
    if batch:
        yield batch


def run_ingestion():
    logger.info("Initializing models and clients...")
    embedder = SentenceTransformer(
        "sentence-transformers/all-MiniLM-L6-v2", device="cpu"
    )
    qdrant = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT, timeout=30)
    from qdrant_client.models import Distance, VectorParams
    collections = [c.name for c in qdrant.get_collections().collections]
    if COLLECTION_NAME not in collections:
        logger.info(f"Creating collection {COLLECTION_NAME}...")
        qdrant.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=384, distance=Distance.COSINE),
        )
    logger.info("Connecting to Hugging Face dataset stream...", dataset=HF_DATASET)
    # Streaming=True prevents downloading the entire 300k dataset to memory at once
    dataset = load_dataset(HF_DATASET, split="train", streaming=True)

    total_upserted = 0
    start_time = time.perf_counter()

    for batch in batched_dataset(dataset, BATCH_SIZE):
        if total_upserted >= MAX_RECORDS:
            break

        # Extract the original unmasked text for the vector database
        texts = [record["source_text"] for record in batch]

        # Batch encode
        t0 = time.perf_counter()
        vectors = embedder.encode(
            texts, batch_size=32, show_progress_bar=False, convert_to_numpy=True
        )
        encode_time = time.perf_counter() - t0

        # Prepare Qdrant points
        points = []
        for text, vector, record in zip(texts, vectors, batch):
            payload = {
                "source": "ai4privacy",
                "language": record.get("language", "en"),
                "content_preview": text[:200],
            }
            points.append(
                PointStruct(
                    id=str(uuid.uuid5(uuid.NAMESPACE_URL, text)),
                    vector=vector.tolist(),
                    payload=payload,
                )
            )

        # Upsert to Qdrant
        t1 = time.perf_counter()
        qdrant.upsert(collection_name=COLLECTION_NAME, points=points, wait=False)
        upsert_time = time.perf_counter() - t1

        total_upserted += len(points)
        logger.info(
            "Batch processed",
            records=total_upserted,
            encode_ms=round(encode_time * 1000, 2),
            upsert_ms=round(upsert_time * 1000, 2),
        )

    total_time = round(time.perf_counter() - start_time, 2)
    logger.info(
        "Ingestion complete", total_records=total_upserted, duration_seconds=total_time
    )


if __name__ == "__main__":
    run_ingestion()
