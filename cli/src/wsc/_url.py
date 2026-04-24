"""URL helpers — redaction and normalization.

Lives in its own module so both `wsc.audit` and `wsc.providers.*` can import
it without pulling in either side's surface area.
"""

from __future__ import annotations

from typing import Iterable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

# Query-string keys whose values must never reach disk or stdout. Lowercased.
_SECRET_KEYS = frozenset(
    {
        "token",
        "tokens",
        "access_token",
        "id_token",
        "refresh_token",
        "auth",
        "authkey",
        "apikey",
        "api_key",
        "api-key",
        "x-api-key",
        "key",
        "secret",
        "client_secret",
        "sig",
        "signature",
        "hmac",
        "session",
        "sessionid",
        "password",
        "passwd",
        "pwd",
    }
)

# Tracking parameters we drop (pure noise, also good for dedup).
_TRACKING_KEYS = frozenset(
    {
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "utm_id",
        "gclid",
        "fbclid",
        "mc_cid",
        "mc_eid",
        "ref",
        "_hsenc",
        "_hsmi",
    }
)


def redact_url(url: str) -> str:
    """Replace secret query values with ``***`` while leaving normal params intact.

    Returns the input unchanged for empty / non-URL strings rather than raising
    so call sites can apply this defensively.
    """

    if not url or "://" not in url:
        return url
    parts = urlsplit(url)
    if not parts.query:
        return url
    new_qs = []
    for k, v in parse_qsl(parts.query, keep_blank_values=True):
        if k.lower() in _SECRET_KEYS:
            new_qs.append((k, "***"))
        else:
            new_qs.append((k, v))
    return urlunsplit(
        (parts.scheme, parts.netloc, parts.path, urlencode(new_qs), parts.fragment)
    )


def normalize_url(url: str, *, drop_tracking: bool = True) -> str:
    """Canonical form for dedup keys.

    Lower-case the host, strip default ports, drop the fragment, drop tracking
    query params, sort the remaining params for stability. Path case is left
    alone (paths are case-sensitive on most servers).
    """

    if not url or "://" not in url:
        return url
    parts = urlsplit(url)
    netloc = parts.hostname.lower() if parts.hostname else ""
    if parts.port and not _is_default_port(parts.scheme, parts.port):
        netloc = f"{netloc}:{parts.port}"
    if parts.username or parts.password:
        # Drop credentials embedded in the URL — they are always sensitive.
        pass

    qs_pairs = [
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if not (drop_tracking and k.lower() in _TRACKING_KEYS)
    ]
    qs_pairs.sort()
    path = parts.path or "/"
    return urlunsplit((parts.scheme.lower(), netloc, path, urlencode(qs_pairs), ""))


def _is_default_port(scheme: str, port: int) -> bool:
    return (scheme == "http" and port == 80) or (scheme == "https" and port == 443)


def redact_each(urls: Iterable[str]) -> list[str]:
    return [redact_url(u) for u in urls]
