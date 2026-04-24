"""Provider registry — single place to instantiate providers from config."""

from __future__ import annotations

from typing import Dict

from wsc import config as wsc_config
from wsc.providers.base import (
    AuthError,
    DisabledError,
    FetchedPage,
    MissingKeyError,
    NormalizedResult,
    Provider,
    ProviderError,
    RateLimitError,
    TransportError,
    http_request,
    safe_get,
)
from wsc.providers.brave import BraveProvider
from wsc.providers.context7 import Context7Provider
from wsc.providers.duckduckgo import DuckDuckGoProvider
from wsc.providers.exa import ExaProvider
from wsc.providers.firecrawl import FirecrawlProvider
from wsc.providers.tavily import TavilyProvider

_FACTORY = {
    "context7": Context7Provider,
    "exa": ExaProvider,
    "tavily": TavilyProvider,
    "firecrawl": FirecrawlProvider,
    "brave": BraveProvider,
    "duckduckgo": DuckDuckGoProvider,
}


def get_provider(name: str) -> Provider:
    """Return a configured provider instance.

    Raises ``DisabledError`` if the kill-switch flag is present, or
    ``MissingKeyError`` if a required key is absent. Lookup is fresh on every
    call — no caching — so disable/enable take effect immediately.
    """
    if name not in _FACTORY:
        raise ValueError(f"unknown provider: {name}")
    if wsc_config.is_disabled(name):
        raise DisabledError(name)
    keys = wsc_config.load_keys()
    cls = _FACTORY[name]
    if name in {"context7", "duckduckgo"}:
        # Both work without a key; pass an optional one through if present.
        return cls(api_key=keys.get(name))
    api_key = keys.get(name)
    if not api_key:
        raise MissingKeyError(name)
    return cls(api_key=api_key)


__all__ = [
    "AuthError",
    "BraveProvider",
    "Context7Provider",
    "DisabledError",
    "DuckDuckGoProvider",
    "ExaProvider",
    "FetchedPage",
    "FirecrawlProvider",
    "MissingKeyError",
    "NormalizedResult",
    "Provider",
    "ProviderError",
    "RateLimitError",
    "TavilyProvider",
    "TransportError",
    "get_provider",
    "http_request",
    "safe_get",
]
