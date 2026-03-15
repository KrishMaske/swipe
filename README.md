# SwipeSmart

SwipeSmart is a smart payments tracking app that connects to bank data via SimpleFIN, enriches transactions with machine learning, and answers natural-language spending questions using retrieval-augmented generation (RAG).

The project currently includes:

- A FastAPI backend for auth-aware data sync and assistant responses.
- Supabase-backed storage with user-scoped access.
- A simple web portal for login, account sync, and chat.
- ML enrichment for categorization, location extraction, embeddings, and optional fraud scoring.

## Table Of Contents

1. Project Goals
2. High-Level Architecture
3. Repository Structure
4. Runtime Data Flow
5. Prerequisites
6. Environment Configuration
7. Installation And Local Run
8. Database Design And RLS Guidance
9. API Reference
10. Chat Assistant Design
11. ML Components
12. Security Model
13. Operational Notes
14. Concurrency, Real-Time, And Scalability Model
15. Troubleshooting
16. Development Roadmap Ideas

## 1) Project Goals

SwipeSmart is designed to answer practical payments and spending questions using a user’s own transactions.

Core goals:

- Connect user bank data using SimpleFIN.
- Persist and normalize account + transaction data.
- Enrich each transaction with category and location context.
- Support contextual follow-up chat questions.
- Provide actionable spending and budgeting guidance.

## 2) High-Level Architecture

### Backend

- Framework: FastAPI
- Entry point: backend/app.py
- Routers:
  - backend/routes/token_exchange.py
  - backend/routes/bank_routes.py
  - backend/routes/chatbot_routes.py

### Data + Auth

- Supabase Postgres for persistence.
- Supabase Auth JWT (ES256) verified against JWKS.
- User-scoped Supabase client built per request using bearer token.

### Payments Data Ingestion

- SimpleFIN setup token exchange to access URL.
- Accounts + transactions fetched from SimpleFIN endpoint.
- Upsert into local database for idempotent sync behavior.

### ML Enrichment

- Merchant category prediction via TF-IDF + Logistic Regression.
- City/state extraction via DistilBERT NER + regex state parser.
- Embedding creation for transaction semantic search.
- Optional fraud scoring module with Isolation Forest.

### Assistant

- RAG over user transactions.
- Follow-up aware history handling.
- Intent carry-over for ambiguous short turns.
- Spending/budget fallback logic and deterministic comparison path for weekly budget checks.

### System Architecture Characteristics

- Request-driven API architecture with strict auth boundaries per call.
- Async request handling for I/O-heavy operations such as model inference and external API/database calls.
- Background task offloading for long-running sync writes to keep user-facing latency low.
- Near-real-time interaction model: users receive immediate API responses while heavy persistence work continues in background.
- Idempotent write strategy (upsert) for resilient repeated sync operations.

## 3) Repository Structure

Top-level:

- index.html: lightweight web portal for auth + API testing + assistant chat.
- README.md: this documentation.
- backend/: main service and model code.

Backend key areas:

- backend/app.py: app bootstrap, CORS, router mounting.
- backend/config/settings.py: environment and shared clients.
- backend/config/security.py: token extraction + verification + user context.
- backend/database/db.py: Supabase read/write and sync persistence.
- backend/routes/: API endpoint handlers.
- backend/utils/simplefin_service.py: SimpleFIN token exchange and account retrieval.
- backend/utils/embeddings.py: transaction embedding generation.
- backend/models/chatbot.py: assistant orchestration, retrieval, and response generation.
- backend/models/categorization.py: category model train/infer.
- backend/models/ner.py: NER pipeline and location extraction.
- backend/models/fraud_dect.py: fraud profile + scoring utilities.

## 4) Runtime Data Flow

### A. User authentication

1. User signs in through Supabase from index.html.
2. Frontend stores session and sends bearer token to backend.
3. Backend verifies JWT with JWKS and builds user-scoped Supabase client.

### B. Bank linking and sync

1. User sends SimpleFIN setup token to POST /api/exchange_setup.
2. Backend decodes/claims token and receives an access URL.
3. Access URL is encrypted and stored in simplefin_conn.
4. GET /api/sync_accounts fetches accounts and transactions.
5. Accounts are upserted, transactions are enriched and upserted.

### C. Transaction enrichment

For each transaction in sync:

1. Category prediction from merchant.
2. City/state extraction from description.
3. Embedding generation from semantic transaction string.
4. Upsert into transactions table using txn_id conflict key.

### D. Assistant question flow

1. Frontend sends question + conversation history to POST /api/ask.
2. Backend builds retrieval query from recent user turns.
3. Embedding search calls match_transactions RPC.
4. For spending/budget intents, fallback retrieval broadens recall.
5. LLM receives curated transaction context and history.
6. Backend returns concise, contextual response.

Latency characteristics:

- Chat endpoint is async and optimized for interactive turn-based response.
- Transaction sync endpoint returns account payload first, then processes transaction writes using background tasks.

## 5) Prerequisites

- Python 3.10+ recommended.
- Supabase project with Auth enabled.
- SimpleFIN Bridge account/setup token flow.
- Groq API key for assistant completions.
- Internet access for external services and model downloads.

## 6) Environment Configuration

Create backend/.env and set:

| Variable | Required | Purpose |
|---|---|---|
| SUPABASE_URL | Yes | Supabase project URL |
| SUPABASE_KEY | Yes | Supabase anon/public key used by API client |
| SUPABASE_JWK | Yes | JWKS endpoint for JWT signature verification |
| FERNET_KEY | Yes | Encryption key for stored SimpleFIN access URL |
| GROQ_KEY | Yes | API key for chat completion calls |

Notes:

- FERNET_KEY must be a valid Fernet key.
- SUPABASE_JWK should point to your Auth JWKS endpoint.
- Keep .env out of source control.

## 7) Installation And Local Run

### Backend setup

Windows PowerShell:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Run API:

```powershell
cd backend
python app.py
```

Server default:

- http://localhost:8000

### Frontend portal

- Open index.html in a browser.
- Sign in with Supabase credentials.
- Copy token, exchange setup token, sync accounts, and use chat.

## 8) Database Design And RLS Guidance

Minimum tables expected by code:

### simplefin_conn

- id (PK)
- user_id
- access_url (encrypted)
- last_sync (epoch)

### accounts

- acc_id (unique/upsert key)
- user_id
- sfc_id (foreign reference to simplefin_conn id)
- provider, acc_type, currency
- balance, available_balance

### transactions

- txn_id (unique/upsert key)
- user_id
- acc_id
- amount
- merchant
- description
- category
- city
- state
- txn_date (epoch timestamp)
- embedding (vector)

### Recommended RPC

The assistant expects a Supabase RPC named match_transactions with arguments:

- query_embedding
- match_threshold
- match_count
- p_user_id

It should return semantically relevant user transactions with fields used by chatbot.py.

### RLS guidance

Enable Row Level Security and ensure each table is scoped by user_id = auth.uid().
All query paths in backend rely on user-scoped JWT auth and should only see caller-owned records.

## 9) API Reference

Base URL: http://localhost:8000

### GET /

Health endpoint.

Response:

```json
{ "message": "Hello World" }
```

### POST /api/exchange_setup

Exchanges SimpleFIN setup token and stores encrypted access URL.

Auth: required bearer token.

Request body:

```json
{ "setup_token": "..." }
```

Success:

```json
{ "message": "Setup exchange successful" }
```

### GET /api/sync_accounts

Fetches accounts from SimpleFIN and queues background tasks to sync transactions and update last_sync.

Auth: required bearer token.

Success shape:

```json
{ "accounts": { "accounts": [ ... ] } }
```

### POST /api/ask

Runs the payments assistant with history-aware context.

Auth: required bearer token.

Request body:

```json
{
  "question": "How can I cut down on spending?",
  "history": [
    { "role": "user", "content": "when was the last time i went to tacobell?" },
    { "role": "assistant", "content": "..." }
  ]
}
```

Response:

```json
{ "response": "...assistant answer..." }
```

## 10) Chat Assistant Design

Implementation: backend/models/chatbot.py

Behavior highlights:

- Builds retrieval query from recent user turns to preserve entity context.
- Detects spending optimization and general finance intent.
- Handles short ambiguous follow-ups by inferring intent from recent turns.
- Uses multiple retrieval passes, then recent-transaction fallback.
- For specific weekly budget comparison prompts, returns deterministic computed answer.
- Uses concise response tuning and history-aware prompts.

This blended approach reduces hallucination and improves continuity for multi-turn conversations.

## 11) ML Components

### Transaction categorization

File: backend/models/categorization.py

- Model: LogisticRegression on TF-IDF features.
- Inference path: predict_category(merchant).
- Confidence floor: returns Uncategorized below threshold.

Artifacts:

- swipe_smart_categorizer_v2.pkl
- swipe_smart_vectorizer_v2.pkl

### Location extraction (NER)

File: backend/models/ner.py

- Pipeline: transformers NER with local swipesmart_BERT model dir.
- Extracts city from entity spans and state from regex over two-letter codes.

### Embeddings

File: backend/utils/embeddings.py

- Encodes semantic transaction sentence via sentence-transformers.
- Output stored on transactions for vector retrieval.

### Fraud scoring (optional)

File: backend/models/fraud_dect.py

- Isolation Forest + StandardScaler.
- Recency-weighted familiarity features for merchant/location behavior.
- Not currently wired to API endpoint, but available for integration.

## 12) Security Model

### Auth verification

- Bearer token is required for all protected routes.
- JWT verified using ES256 and Supabase JWKS.
- Expiry validation enabled.

### User scoping

- Backend creates a user-scoped Supabase client with request auth header.
- Database access should be further protected with RLS.

### Sensitive data handling

- SimpleFIN access URL is encrypted before storage.
- Fernet key is loaded from environment.

### Operational cautions

- Avoid logging raw tokens, decrypted access URLs, and sensitive account details.
- Rotate keys if compromise is suspected.

## 13) Operational Notes

- Sync endpoint uses background tasks for transaction write + sync timestamp update.
- If last_sync exists, sync window starts slightly earlier to avoid missing late-posted transactions.
- Upsert semantics make repeated sync runs safer and mostly idempotent.

## 14) Concurrency, Real-Time, And Scalability Model

### Concurrency model (current)

- FastAPI serves request/response workloads concurrently for I/O-bound operations.
- POST /api/ask is implemented as an async handler for chat processing.
- GET /api/sync_accounts schedules background tasks so transaction persistence is decoupled from the immediate response.

### Multithreading status

- There is no custom application-managed multithreading layer in current business logic.
- Concurrency is primarily achieved through async I/O plus server runtime worker concurrency.
- Horizontal/process scaling can be achieved at deploy time by running multiple Uvicorn workers.

### Real-time status

- The app is near-real-time, not stream-real-time.
- Users receive immediate responses for auth and chat workflows.
- Bank data changes are reflected after sync operations; there is no WebSocket or push-stream channel in the current FastAPI API layer.

### Throughput and scaling levers

- Increase API workers for higher concurrent request capacity.
- Move sync background work to a durable queue/worker system for large datasets.
- Add DB indexes on user_id, txn_id, acc_id, and txn_date for faster retrieval paths.
- Add caching for repeated retrieval patterns and derived analytics summaries.

### Reliability notes

- Upsert-based writes improve idempotency during repeated sync calls.
- Auth-scoped clients + RLS reduce cross-tenant data risk in concurrent workloads.
- External dependency latency (SimpleFIN, LLM, Supabase) is the dominant factor for tail response time.

## 15) Troubleshooting

### 401 Missing or invalid Authorization header

- Verify frontend sends Bearer token.
- Confirm token is active and not expired.

### Invalid or expired token

- Check SUPABASE_JWK is correct.
- Confirm audience and signing algorithm match expected values.

### No linked bank connection found

- Run POST /api/exchange_setup first.
- Confirm simplefin_conn row exists for the authenticated user.

### Setup exchange failed

- Validate setup token format.
- Ensure token can be decoded to a valid HTTP(S) URL.

### NER model loading issues

- Ensure backend/models/swipesmart_BERT exists and includes config/tokenizer/model files.

### Assistant says no matching transactions

- Confirm transactions table has rows for current user_id.
- Verify embeddings are generated and match_transactions RPC is configured.

### Contradictory budgeting responses

- Recent versions include deterministic weekly-budget comparison logic.
- Restart backend after pulling latest chatbot.py changes.

## 16) Development Roadmap Ideas

- Add fraud-scoring endpoint and UI visualization.
- Add explicit analytics endpoints for category and merchant aggregates.
- Add structured assistant response schema for UI rendering.
- Add evaluation tests for multi-turn assistant consistency.
- Move frontend secrets and config into safer runtime config pattern.
- Add CI checks for linting, typing, and API smoke tests.

## License

No license file is currently present in this repository. Add one before public distribution.
