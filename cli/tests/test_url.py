"""Tests for wsc._url — redaction and normalization."""

from wsc._url import normalize_url, redact_url


# -- redact_url ------------------------------------------------------------


def test_redact_strips_token():
    out = redact_url("https://example.com/path?token=SECRET&q=hello")
    assert "SECRET" not in out
    assert "token=%2A%2A%2A" in out or "token=***" in out
    assert "q=hello" in out


def test_redact_preserves_normal_query_params():
    # The ``q`` param is the actual user-visible search; never redact.
    url = "https://duckduckgo.com/?q=anthropic+claude&format=json"
    out = redact_url(url)
    assert "q=anthropic" in out
    assert "format=json" in out


def test_redact_handles_multiple_secret_keys():
    url = "https://api.example.com/x?api_key=A&signature=B&access_token=C&page=1"
    out = redact_url(url)
    for forbidden in ("=A", "=B", "=C"):
        assert forbidden not in out
    assert "page=1" in out


def test_redact_is_case_insensitive_for_keys():
    url = "https://example.com/?Token=X&Q=ok"
    out = redact_url(url)
    assert "X" not in out
    assert "Q=ok" in out


def test_redact_passes_through_when_no_query():
    assert redact_url("https://example.com/path") == "https://example.com/path"


def test_redact_passes_through_non_url_strings():
    assert redact_url("") == ""
    assert redact_url("not a url") == "not a url"


# -- normalize_url ---------------------------------------------------------


def test_normalize_lowercases_host_and_drops_default_port():
    assert normalize_url("HTTPS://Example.COM:443/Path?b=1&a=2") == "https://example.com/Path?a=2&b=1"


def test_normalize_drops_tracking_params():
    out = normalize_url("https://example.com/x?utm_source=z&q=hello&fbclid=abc")
    assert "utm_source" not in out
    assert "fbclid" not in out
    assert "q=hello" in out


def test_normalize_drops_fragment():
    assert normalize_url("https://example.com/x#section") == "https://example.com/x"


def test_normalize_keeps_path_case():
    # Most servers serve different content for /Path vs /path.
    assert "/Path/Sub" in normalize_url("https://example.com/Path/Sub")


def test_normalize_handles_no_path():
    assert normalize_url("https://example.com") == "https://example.com/"
