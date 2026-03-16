# Swipe Engineering Brief

Swipe is an AI-first smart payments system with a FastAPI backend, Expo mobile client, Supabase persistence/auth, and an ML-assisted transaction pipeline.

This document is intentionally concise and operationally focused.

## 1) System Scope

Product pillars:
- SwipeSmart: location-aware card recommendations.
- SwipeGuard: transaction anomaly detection and fraud triage.
- SwipeChat: retrieval-grounded payments assistant over user transaction history.
- Live Sync: SimpleFIN ingestion with enrichment and idempotent persistence.

Primary backend objectives:
- Maintain strict tenant isolation.
- Keep sync and scoring idempotent and observable.
- Preserve low-latency reads for dashboard/chat paths.
- Degrade safely under dependency failures.

## 2) Core Stack

- API: FastAPI (Python)
- Scheduler: APScheduler AsyncIOScheduler (in-process)
- Data/Auth: Supabase Postgres + Supabase Auth + RLS
- ML:
  - TF-IDF + LogisticRegression categorization
  - BERT NER for location extraction
  - IsolationForest fraud model with feature breakdown
  - SentenceTransformer embeddings for semantic retrieval
- External services:
  - SimpleFIN
  - Overpass + Nominatim
  - Groq LLM

## 3) Backend Architecture

Request path layering:
1. Route handlers validate input and compose service calls.
2. Security dependency verifies JWT, builds request-scoped Supabase client.
3. Data layer executes user-scoped reads/writes.
4. ML enrichment runs during transaction sync.

Security model:
- Bearer token required on protected routes.
- JWT verified via JWKS.
- user_id-scoped operations plus RLS defense in depth.
- Admin-only controls for global fraud retraining endpoints.

Idempotency model:
- accounts upsert keyed by acc_id.
- transactions upsert keyed by txn_id.
- chat summaries upsert keyed by user_id.

## 4) Runtime Flows

### Authentication
1. Client sends bearer token.
2. Backend validates token and extracts user context.
3. Request-scoped Supabase client executes user-bound query path.

### Bank Sync
1. Client or scheduler triggers account sync.
2. Backend loads encrypted SimpleFIN access URL and sync window.
3. Accounts fetched and upserted.
4. Transactions enriched with category, location, fraud score, embeddings.
5. last_sync persisted.

### Fraud Scoring
- Every synced transaction runs through score_transaction.
- Output persisted: is_flagged_fraud, risk_score, feature_breakdown.

### Chat Retrieval
1. Build query embedding from user question.
2. Retrieve top relevant transactions (vector + fallback path).
3. Inject budgets + rolling summary context.
4. Produce constrained assistant response.

## 5) Scheduler Operations

Scheduler characteristics:
- Started/stopped by FastAPI lifespan hooks.
- Native async job execution under AsyncIOScheduler.
- Safety defaults: coalesce=true, max_instances=1.

Scheduled jobs:
- sync_all_accounts_job: 00:00, 06:00, 12:00, 15:00, 18:00, 21:00
- retrain_fraud_model_job: monthly, day 1, 00:00

Lifecycle notifications:
- Start email: sent immediately when a job begins.
- Success email: includes execution stats.
- Error email: includes traceback HTML.

Fraud retraining post-check:
- On successful retrain, evaluate using fraud_rows.csv.
- Build HTML report with per-row status:
  - red for anomaly
  - green for normal
- Include feature breakdown table per transaction.
- Embed report in retraining success email.

## 6) API Surface (Critical Endpoints)

Health:
- GET /

SimpleFIN:
- POST /api/exchange_setup
- GET /api/accounts/sync
- GET /api/accounts/sync-status

Accounts and transactions:
- GET /api/accounts
- GET /api/transactions?acc_id=...
- GET /api/transactions/fraud
- POST /api/transactions/update-fraud-status

Budgets:
- GET /api/transactions/budgets
- POST /api/transactions/create-budget
- PUT /api/transactions/budgets/{budget_id}
- DELETE /api/transactions/budgets/{budget_id}

Cards and location:
- GET /api/user/cards
- POST /api/user/cards
- GET /api/location/nearby-merchants
- POST /api/location/evaluate

Chat and model:
- POST /api/ask
- POST /api/train-fraud-model (admin)
- POST /api/score-transaction

## 7) Data Contracts

Expected tables:
- simplefin_conn
- accounts
- transactions
- budgets
- user_cards
- chat_summaries

Important transaction columns:
- user_id, txn_id, acc_id
- amount, merchant, category, city, state, txn_date
- embedding
- is_flagged_fraud, is_confirmed_fraud, risk_score, feature_breakdown

RLS requirement:
- All user tables enforce auth.uid() = user_id semantics.

## 8) Frontend Cache Policy (Current)

Cache strategy is indefinite with explicit invalidation.

Sync-driven invalidation applies to:
- accounts
- transactions
- fraud alerts
- budgets

Mutation-driven invalidation:
- budgets refresh after create/update/delete
- cards refresh/update after wallet mutations

Sync-awareness mechanism:
- frontend polls /api/accounts/sync-status and invalidates local caches when last_sync increases.

## 9) Reliability and Failure Modes

Known constraints:
- Scheduler is in-process; multi-replica deployments need singleton scheduling strategy.
- External dependency latency can dominate p95 (SimpleFIN, geocoding, LLM).

Operational expectations:
- Fail closed on auth path.
- Fail soft where optional state updates are non-critical to user response.
- Never log secrets, tokens, or decrypted financial connection URLs.

## 10) Configuration

Required backend environment variables:
- SUPABASE_URL
- SUPABASE_KEY
- SUPABASE_SERVICE_KEY
- SUPABASE_JWK
- FERNET_KEY
- GROQ_KEY
- SMTP_EMAIL
- SMTP_PASSWORD

Optional backend environment variables:
- SMTP_HOST (default smtp.gmail.com)
- SMTP_PORT (default 587)
- SCHEDULER_TIMEZONE (default UTC)
- APP_ENV
- CORS_ORIGINS (required outside development)

## 11) Local Runbook

Backend:
1. cd backend
2. python -m venv .venv
3. .\.venv\Scripts\Activate.ps1
4. pip install -r requirements.txt
5. python app.py

Mobile:
1. cd mobile
2. npm install
3. npm run start

## 12) Immediate Engineering Priorities

1. Move sync/enrichment heavy paths to durable workers for horizontal scale.
2. Add structured logging and request correlation IDs.
3. Add tracing across API, DB, and external calls.
4. Add CI checks for types, linting, tests, and smoke integration.
5. Formalize migration/versioning workflow for schema changes.
