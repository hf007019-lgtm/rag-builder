# RAG Builder Project Overview

## 1. Project Summary

This project is a local RAG document question-answering backend.

The main architecture is:

- FastAPI as the HTTP gateway
- PostgreSQL for document metadata
- MinIO for uploaded file storage
- Redis as the Celery broker and result backend
- Celery worker for asynchronous document parsing
- Elasticsearch for hybrid retrieval and vector search
- Qwen/OpenAI-compatible API for embeddings and answer generation

The project currently focuses on a simple end-to-end flow:

1. Upload a document.
2. Store the raw file in MinIO.
3. Register document metadata in PostgreSQL.
4. Dispatch an asynchronous parsing task.
5. Split document text into chunks.
6. Generate embeddings for each chunk.
7. Store chunks and vectors in Elasticsearch.
8. Retrieve relevant chunks for a user question.
9. Generate a final answer using an LLM.

## 2. Directory Structure

```text
rag_builder/
+-- app/
|   +-- main.py
|   +-- models.py
+-- worker/
|   +-- celery_app.py
|   +-- tasks.py
|   +-- deepdoc/
|       +-- core_engine.py
|       +-- es_client.py
+-- docker-compose.yml
+-- .env
+-- project_overview.md
```

## 3. Key Modules

### app/main.py

FastAPI application entry point.

Main responsibilities:

- Initialize the FastAPI app.
- Connect to MinIO.
- Create the `rag-docs` bucket if needed.
- Initialize the embedding/LLM engine.
- Initialize the Elasticsearch vector store.
- Provide the upload API.
- Provide the question-answering API.

Main endpoints:

- `POST /upload/`
- `POST /ask/`

### app/models.py

SQLAlchemy database model definitions.

Current table:

- `documents`

Current fields:

- `id`
- `file_name`
- `file_hash`
- `status`
- `created_at`

The module also creates the SQLAlchemy engine and session factory.

### worker/celery_app.py

Celery application configuration.

Current Redis configuration:

```text
redis://127.0.0.1:16379/0
```

The worker loads task definitions from:

```text
worker.tasks
```

### worker/tasks.py

Background document parsing logic.

Main task:

```python
parse_document_task(doc_id: int)
```

Processing steps:

1. Load the document record from PostgreSQL.
2. Mark status as `PARSING`.
3. Read the uploaded file from MinIO.
4. Decode the file as text.
5. Split the text and generate embeddings.
6. Insert chunks into Elasticsearch.
7. Refresh the Elasticsearch index.
8. Mark status as `SUCCESS`.
9. On failure, mark status as `FAILED`.

Current limitation:

- The first implementation mainly supports text files.
- PDF, DOCX, and other document formats are not yet implemented.

### worker/deepdoc/core_engine.py

Text processing and LLM client logic.

Main class:

```python
DeepDocEngine
```

Main responsibilities:

- Load `.env` configuration.
- Initialize an OpenAI-compatible client.
- Configure the embedding model.
- Split raw text into chunks.
- Generate embeddings for chunks.

Default embedding model:

```text
text-embedding-v2
```

### worker/deepdoc/es_client.py

Elasticsearch vector store logic.

Main class:

```python
VectorStore
```

Main responsibilities:

- Connect to local Elasticsearch.
- Wait for Elasticsearch readiness.
- Create the `rag_chunks` index if it does not exist.
- Store document chunks and vectors.
- Run hybrid retrieval using BM25 text matching and dense vector KNN.

Current index:

```text
rag_chunks
```

Current vector field:

```text
vector
```

Current vector dimension:

```text
1536
```

## 4. Runtime Services

The infrastructure services are defined in `docker-compose.yml`.

| Service | Container | Local Port | Internal Port | Purpose |
| --- | --- | ---: | ---: | --- |
| PostgreSQL | `rag_postgres` | `15432` | `5432` | Metadata database |
| MinIO API | `rag_minio` | `9002` | `9000` | Object storage API |
| MinIO Console | `rag_minio` | `9003` | `9001` | Object storage UI |
| Redis | `rag_redis` | `16379` | `6379` | Celery broker/backend |
| Elasticsearch | `rag_es` | `9200` | `9200` | Hybrid and vector search |
| Kibana | `rag_kibana` | `15601` | `5601` | Elasticsearch UI |

## 5. Main Data Flow

### Upload Flow

```text
Client
  -> FastAPI /upload/
  -> SHA256 file hash
  -> duplicate check in PostgreSQL
  -> upload file to MinIO
  -> create Document row with PENDING status
  -> dispatch Celery task
  -> return doc_id
```

### Parsing Flow

```text
Celery Worker
  -> load Document by doc_id
  -> set status to PARSING
  -> read file from MinIO
  -> decode text
  -> split text into chunks
  -> call embedding model
  -> insert chunks into Elasticsearch
  -> refresh Elasticsearch index
  -> set status to SUCCESS
```

### Question Answering Flow

```text
Client
  -> FastAPI /ask/
  -> embed user question
  -> Elasticsearch hybrid search
  -> collect top chunks as context
  -> call qwen-plus
  -> return answer and source chunks
```

## 6. Configuration

Important environment variables are loaded from `.env`:

```text
LLM_BASE_URL
LLM_API_KEY
EMBEDDING_MODEL_NAME
```

The code currently hardcodes several service connection strings:

- PostgreSQL: `postgresql://rag_admin:rag_secure@127.0.0.1:15432/rag_db`
- MinIO: `127.0.0.1:9002`
- Redis: `redis://127.0.0.1:16379/0`
- Elasticsearch: `http://127.0.0.1:9200`

## 7. Suggested Startup Commands

Start infrastructure:

```powershell
docker compose up -d
```

Start the FastAPI app:

```powershell
uvicorn app.main:app --reload
```

Start the Celery worker:

```powershell
celery -A worker.celery_app.celery_app worker --loglevel=info
```

## 8. Current Risks and Notes

- The project does not currently include a `requirements.txt` or `pyproject.toml`.
- `.env` contains a real API key and should not be committed to a public repository.
- Some `.env` variable names and values appear misspelled, although several values are currently hardcoded in Python.
- Source comments and some Chinese strings appear garbled in terminal output, likely due to encoding mismatch or prior incorrect encoding conversion.
- Document parsing currently handles text files only.
- The Elasticsearch vector dimension is fixed at `1536`; this must match the embedding model output.
- Database migrations are not implemented. The project currently uses `Base.metadata.create_all`.
- There is no visible test suite yet.
- The directory is not currently a Git repository.

## 9. Recommended Next Improvements

1. Add dependency management with `requirements.txt` or `pyproject.toml`.
2. Move all service connection settings into environment variables.
3. Fix `.env` typos and remove secrets from tracked files.
4. Normalize source file encoding to UTF-8.
5. Add support for PDF and DOCX parsing.
6. Add a document status query endpoint.
7. Add basic tests for upload, parsing, and retrieval behavior.
8. Add Alembic migrations for database schema management.
9. Add structured logging instead of relying on `print`.
10. Add error details or retry strategy for failed Celery tasks.
