"""Tests for wsc.routing — RuleRouter classification correctness.

Covers ≥30 distinct query → op cases per the plan.
"""

import pytest

from wsc.routing import RuleRouter, get_router, LlmRouter


router = RuleRouter()


@pytest.mark.parametrize(
    "query,expected_op",
    [
        # --- Library docs (Context7 lane) ---
        ("react useState", "docs"),
        ("react hooks", "docs"),
        ("next.js middleware auth", "docs"),
        ("tailwind dark mode setup", "docs"),
        ("kotlin coroutines tutorial", "docs"),
        ("fastapi background tasks", "docs"),
        ("openai api docs", "docs"),
        ("anthropic prompt caching", "docs"),
        ("tokio runtime explained", "docs"),
        ("supabase auth row level security", "docs"),
        # --- URL → fetch / crawl ---
        ("https://docs.anthropic.com/claude/docs", "fetch"),
        ("HTTPS://Example.com/path?token=x", "fetch"),
        ("https://docs.firecrawl.dev/*", "crawl"),
        ("https://example.com/section/**", "crawl"),
        # --- Discovery (Exa lane) ---
        ("alternatives to react", "discover"),
        ("react vs vue", "discover"),
        ("fastapi vs flask", "discover"),
        ("compare prisma and drizzle", "discover"),
        ("find me papers on speculative decoding", "discover"),
        ("research papers about diffusion models", "discover"),
        ("libraries like firecrawl", "discover"),
        ("similar to Hermit governed agent runtime", "discover"),
        ("competitors of langchain", "discover"),
        # --- Web facts / news (Tavily lane) ---
        ("claude 4.7 latest features", "search"),
        ("news on apple m4 mac mini", "search"),
        ("supabase pricing", "search"),
        ("best frontend framework 2026", "search"),
        ("openai release notes", "search"),
        ("what's the price of gpt-5", "search"),
        # --- Default fallback ---
        ("hello", "search"),
        ("", "search"),
        ("ECC eval-driven development", "search"),
    ],
)
def test_rule_router_classifies(query, expected_op):
    decision = router.classify(query)
    assert decision.recommended_op == expected_op, (
        f"query={query!r} → got {decision.recommended_op}, expected {expected_op}\n"
        f"rules_fired={decision.rules_fired}"
    )


def test_router_marks_ambiguous_on_library_plus_time():
    # "react latest version" hits both library and time → ambiguous, conf clamped.
    decision = router.classify("react latest version")
    assert decision.ambiguous
    assert decision.confidence <= 0.5
    assert decision.why_not


def test_router_emits_route_decision_schema():
    decision = router.classify("react useState")
    d = decision.to_dict()
    for key in (
        "intent",
        "classifier_version",
        "recommended_op",
        "recommended_provider",
        "confidence",
        "ambiguous",
        "rationale",
        "rules_fired",
        "why_not",
        "search_budget",
    ):
        assert key in d
    assert d["classifier_version"] == "rule-v1"
    assert d["recommended_provider"] == "context7"


def test_router_rationale_is_present_for_default_fallback():
    decision = router.classify("hello")
    assert "default" in decision.rationale.lower()
    assert decision.search_budget == 1


def test_prefer_deep_increases_budget():
    decision = router.classify("react useState", context={"prefer": "deep"})
    assert decision.search_budget >= 3


def test_explicit_budget_override_wins():
    decision = router.classify("react useState", context={"budget_override": 7})
    assert decision.search_budget == 7


def test_get_router_returns_rule_by_default():
    assert isinstance(get_router(), RuleRouter)


def test_get_router_llm_returns_scaffold():
    r = get_router("llm")
    assert isinstance(r, LlmRouter)
    with pytest.raises(NotImplementedError):
        r.classify("anything")


def test_get_router_unknown_raises():
    with pytest.raises(ValueError):
        get_router("astrology")
