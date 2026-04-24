"""Provider plumbing — normalized result schema, error taxonomy, HTTP helper.

Design points (locked in by the plan):

* ``NormalizedResult`` is the cross-provider shape; every provider's ``search``
  method returns ``list[NormalizedResult]``. Receipt aggregations (results_count,
  selected_count, by_domain) all rely on this normalization, so providers must
  not skip it.
* The error hierarchy distinguishes ``transport_error`` (DNS/SSL/timeout, retry
  helps), ``rate_limit`` (Retry-After honored), ``auth_error`` (don't retry,
  surface to user), and generic ``provider_error`` (unknown 4xx/5xx).
* Zero external deps — uses stdlib ``urllib`` only. Mature enough for what we
  need; tests monkey-patch ``http_request`` directly.
"""

from __future__ import annotations

import json
import socket
import ssl
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from wsc._url import normalize_url, redact_url


@dataclass
class NormalizedResult:
    """Cross-provider shape for a single search hit."""

    url: str
    title: str
    snippet: str = ""
    score: Optional[float] = None
    published_at: Optional[str] = None
    source_kind: str = "web"  # one of: doc | web | paper | code | company
    provider: str = ""
    url_normalized: str = ""
    raw: Optional[Dict[str, Any]] = field(default=None, repr=False)

    def __post_init__(self) -> None:
        if self.url and not self.url_normalized:
            try:
                self.url_normalized = normalize_url(self.url)
            except Exception:  # noqa: BLE001 - normalization must never crash a result.
                self.url_normalized = self.url

    def to_dict(self, *, include_raw: bool = False) -> Dict[str, Any]:
        d = {
            "url": redact_url(self.url),
            "title": self.title,
            "snippet": self.snippet,
            "score": self.score,
            "published_at": self.published_at,
            "source_kind": self.source_kind,
            "provider": self.provider,
            "url_normalized": self.url_normalized,
        }
        if include_raw:
            d["raw"] = self.raw
        return d


@dataclass
class FetchedPage:
    """Cross-provider shape for a single fetched URL."""

    url: str
    title: str = ""
    markdown: str = ""
    html: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    provider: str = ""
    fetched_at: Optional[str] = None
    url_normalized: str = ""
    status: str = "ok"  # ok | degraded | error

    def __post_init__(self) -> None:
        if self.url and not self.url_normalized:
            try:
                self.url_normalized = normalize_url(self.url)
            except Exception:  # noqa: BLE001
                self.url_normalized = self.url

    def to_dict(self) -> Dict[str, Any]:
        return {
            "url": redact_url(self.url),
            "title": self.title,
            "markdown": self.markdown,
            "metadata": self.metadata,
            "provider": self.provider,
            "fetched_at": self.fetched_at,
            "url_normalized": self.url_normalized,
            "status": self.status,
        }


# --- Error taxonomy -------------------------------------------------------


class ProviderError(Exception):
    """Base class for provider failures.

    Subclasses set ``kind`` so callers (ops + plan) can decide whether to
    retry, fall back to another provider, or surface to the user.
    """

    def __init__(
        self,
        message: str,
        *,
        kind: str = "provider_error",
        retryable: bool = False,
        status: Optional[int] = None,
    ) -> None:
        super().__init__(message)
        self.kind = kind
        self.retryable = retryable
        self.status = status


class TransportError(ProviderError):
    def __init__(self, message: str) -> None:
        super().__init__(message, kind="transport_error", retryable=True)


class RateLimitError(ProviderError):
    def __init__(self, message: str, retry_after: Optional[float] = None) -> None:
        super().__init__(message, kind="rate_limit", retryable=True, status=429)
        self.retry_after = retry_after


class AuthError(ProviderError):
    def __init__(self, message: str) -> None:
        super().__init__(message, kind="auth_error", retryable=False, status=401)


class MissingKeyError(ProviderError):
    """Raised before any HTTP is attempted when a required key is absent."""

    def __init__(self, provider: str) -> None:
        super().__init__(f"{provider}: API key not configured", kind="missing_key")
        self.provider = provider


class DisabledError(ProviderError):
    """Raised when wsc config disable <provider> has been set."""

    def __init__(self, provider: str) -> None:
        super().__init__(f"{provider}: provider is disabled (wsc config enable {provider} to undo)", kind="disabled")
        self.provider = provider


# --- Helpers --------------------------------------------------------------


def safe_get(payload: Any, *keys: Any, default: Any = None) -> Any:
    """Walk a nested dict/list. Returns ``default`` on missing or type mismatch.

    Use everywhere a provider response is parsed so a schema drift surfaces as
    a missing field (recorded into receipt warnings) rather than a KeyError
    that crashes the whole subcommand.
    """

    val: Any = payload
    for k in keys:
        try:
            val = val[k]
        except (KeyError, IndexError, TypeError):
            return default
    return val


def http_request(
    url: str,
    *,
    method: str = "GET",
    headers: Optional[Dict[str, str]] = None,
    body: Optional[Any] = None,
    params: Optional[Dict[str, str]] = None,
    timeout: float = 30.0,
) -> Dict[str, Any]:
    """Issue one HTTP request and return ``{status, headers, text, json}``.

    Maps known failure modes to the ``ProviderError`` family so providers
    don't have to repeat the boilerplate.
    """

    if params:
        sep = "&" if "?" in url else "?"
        url = url + sep + urllib.parse.urlencode(params)

    if isinstance(body, dict):
        body_bytes: Optional[bytes] = json.dumps(body).encode("utf-8")
        headers = dict(headers or {})
        headers.setdefault("content-type", "application/json")
    elif isinstance(body, str):
        body_bytes = body.encode("utf-8")
    elif isinstance(body, bytes):
        body_bytes = body
    else:
        body_bytes = None

    req = urllib.request.Request(url, data=body_bytes, method=method)
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    req.add_header("user-agent", "wsc/0.1 (+https://github.com/heggria/web-surfing-cli)")

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            text = resp.read().decode("utf-8", errors="replace")
            try:
                payload = json.loads(text) if text else None
            except ValueError:
                payload = None
            return {
                "status": resp.status,
                "headers": dict(resp.headers.items()),
                "text": text,
                "json": payload,
            }
    except urllib.error.HTTPError as exc:
        body_text = ""
        try:
            body_text = exc.read().decode("utf-8", errors="replace")
        except Exception:  # noqa: BLE001
            pass
        if exc.code == 429:
            ra = None
            ra_raw = exc.headers.get("Retry-After") if exc.headers else None
            if ra_raw:
                try:
                    ra = float(ra_raw)
                except ValueError:
                    ra = None
            raise RateLimitError(f"{url}: HTTP 429 rate limit", retry_after=ra)
        if exc.code in (401, 403):
            raise AuthError(f"{url}: HTTP {exc.code} {exc.reason}")
        raise ProviderError(
            f"{url}: HTTP {exc.code} {exc.reason} body={body_text[:200]!r}",
            status=exc.code,
        )
    except (urllib.error.URLError, socket.timeout, TimeoutError, ssl.SSLError) as exc:
        raise TransportError(f"{url}: {type(exc).__name__}: {exc}")


# --- Provider abstract base ----------------------------------------------


class Provider:
    """Marker base class. v0.1 doesn't enforce a method protocol because each
    provider supports a different verb set (search vs fetch vs crawl vs docs)."""

    name: str = ""
    schema_version: str = "v1"
