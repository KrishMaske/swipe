"""Disk-backed memoization cache for NLP location extraction.

Uses diskcache.Cache (SQLite under the hood) stored in ./bert_location_cache.
The folder can be pre-warmed locally and securely copied to the Oracle
production server — the SQLite file is fully portable.

Typical flow during transaction ingestion
-----------------------------------------
for txn in transactions:
    description = txn.get("description", "")
    city, state = get_cached_location(description)   # BERT skipped on hit
    ...

Cache invalidation on user corrections
---------------------------------------
When a user edits a transaction's city or state, call:

    update_cached_location(description, new_city, new_state)

This ensures the next ingestion of any transaction sharing the same
description (e.g. another "DUNKIN DONUTS EAST BRUNSWI NJ" charge) uses
the human-verified values instead of the original NLP extraction.
"""

import os
import diskcache
from models.ner import extract_location

# ---------------------------------------------------------------------------
# Cache initialisation
# ---------------------------------------------------------------------------

_CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "bert_location_cache")
_cache = diskcache.Cache(_CACHE_DIR)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_cached_location(description: str) -> tuple[str, str]:
    """Return ``(city, state)`` for a transaction description.

    Cache hit  → returns immediately, BERT model is never invoked.
    Cache miss → runs NLP extraction, stores the result, then returns.

    Parameters
    ----------
    description:
        Raw transaction description string from the bank feed.

    Returns
    -------
    tuple[str, str]
        ``(city, state)`` — either of which may be ``None`` if unresolvable.
    """
    key = (description or "").strip()

    cached = _cache.get(key)
    if cached is not None:
        return cached  # (city, state) tuple — fast path

    # Cache miss: run the expensive BERT + regex extraction
    city, state = extract_location(key)
    _cache.set(key, (city, state))
    return city, state


def update_cached_location(description: str, city: str, state: str) -> None:
    """Overwrite the cached ``(city, state)`` pair for *description*.

    Call this whenever a user manually corrects location data on a
    transaction so that future ingestions of the same description
    (e.g. recurring merchants) use the verified values.

    Example
    -------
    The NLP model stored ``("DUNKIN EAST BRUNSWI", "NJ")`` for a description.
    The user corrects city to ``"EAST BRUNSWICK"``.  Calling:

        update_cached_location(description, "EAST BRUNSWICK", "NJ")

    ensures every subsequent charge from that merchant resolves correctly
    without re-running BERT.
    """
    key = (description or "").strip()
    _cache.set(key, (city, state))
