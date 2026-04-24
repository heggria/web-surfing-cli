"""Shared helpers for ops/*.

Every op follows the same pattern:

1. Open an ``audit.start_call`` context with the op name + planned provider.
2. Walk the role's fallback chain. For each provider, try the action lambda.
   On a known provider error, append to ``fallback_chain`` and try the next.
3. On success, mutate the receipt in-place with results/provider/fallback_chain
   and return a payload dict for ``cli._emit``.
"""

from __future__ import annotations

import hashlib
from typing import Any, Callable, Dict, List, Optional, Tuple

from wsc import config as wsc_config
from wsc.providers import (
    AuthError,
    DisabledError,
    MissingKeyError,
    Provider,
    ProviderError,
    RateLimitError,
    TransportError,
    get_provider,
)


def filtered_chain(role: str) -> List[str]:
    """Default chain from config, *not yet* filtered by availability — that's
    decided per-call at provider instantiation time so disable/enable flags
    take effect immediately."""
    return list(wsc_config.ROLE_FALLBACK_CHAIN.get(role, []))


def query_fingerprint(query: str) -> Dict[str, str]:
    if not query:
        return {"query_hash": "", "query_preview": ""}
    h = hashlib.sha256(query.encode("utf-8")).hexdigest()
    return {"query_hash": h, "query_preview": query[:80]}


def run_chain(
    chain: List[str],
    actions: Dict[str, Callable[[Provider], Any]],
) -> Tuple[Optional[str], Any, List[Dict[str, Any]]]:
    """Try each provider in ``chain`` with its action; return
    ``(active_provider, result, fallback_chain)``. ``result`` is whatever the
    action returns (list of NormalizedResult, FetchedPage, etc.) — the op is
    responsible for shaping it."""

    fallback: List[Dict[str, Any]] = []
    for name in chain:
        action = actions.get(name)
        if action is None:
            continue
        try:
            provider = get_provider(name)
        except (MissingKeyError, DisabledError) as exc:
            fallback.append({"from": name, "reason": exc.kind})
            continue
        try:
            result = action(provider)
            return name, result, fallback
        except (RateLimitError, TransportError, AuthError, ProviderError) as exc:
            fallback.append(
                {
                    "from": name,
                    "reason": exc.kind,
                    "error": str(exc)[:200],
                }
            )
            continue
    return None, None, fallback


def chain_failed_payload(op_name: str, fallback: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {
        "ok": False,
        "operation": op_name,
        "provider": None,
        "fallback_chain": fallback,
        "error": f"{op_name}: all providers failed (chain={[f['from'] for f in fallback]})",
        "returncode": 2,
    }
