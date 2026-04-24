"""Routing — turn a free-form query into a tool/provider decision.

Two routers are defined:

* ``RuleRouter`` — pure rules over the query string. No I/O, no env reads,
  no model. The default and the only one wired in v0.1.
* ``LlmRouter`` — protocol scaffold for an opt-in LLM-backed classifier.
  Raises in v0.1 with a clear "not implemented" message; v0.2 lights it up.

The router does not call any provider — it only decides which one *would* be
called. ``wsc plan --explain`` returns the full ``RouteDecision`` without
spending API credits, which is the v0.1 path-to-confidence for the policy.
"""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional, Protocol, Tuple


# --- Rule corpus ----------------------------------------------------------

# Loose "I recognize this name" set. Not exhaustive — discovery rules cover the
# tail. Adding a name here only changes which way ambiguity tips, not whether a
# query is reachable.
KNOWN_LIBRARIES: frozenset = frozenset(
    {
        # JS/TS
        "react", "vue", "svelte", "solid", "next", "nuxt", "remix", "astro",
        "vite", "esbuild", "webpack", "turbopack", "rollup",
        "tailwind", "shadcn", "chakra", "mantine", "radix",
        "node", "nodejs", "bun", "deno",
        "express", "fastify", "hono", "nestjs", "koa", "elysia",
        "tanstack", "react-query", "zustand", "redux", "jotai", "valtio", "recoil",
        "trpc", "drizzle", "prisma", "knex", "mongoose", "typeorm",
        # Python
        "django", "flask", "fastapi", "starlette", "litestar", "pydantic",
        "sqlalchemy", "alembic", "celery", "huey",
        "pandas", "numpy", "polars", "scikit-learn", "scipy",
        # Go / Rust / JVM / Swift / etc.
        "axum", "actix", "tokio", "rocket", "tonic",
        "spring", "quarkus", "ktor", "exposed",
        "swiftui", "uikit", "vapor",
        # AI / Cloud
        "anthropic", "openai", "langchain", "llamaindex", "ollama",
        "supabase", "firebase", "convex", "neon", "planetscale",
        # Tooling
        "git", "docker", "kubernetes", "k8s", "terraform", "pulumi",
        "pytest", "jest", "vitest", "playwright", "cypress",
        # Languages
        "kotlin", "swift", "rust", "golang", "python", "typescript", "javascript",
        # Editors / Agents
        "claude-code", "cursor", "codex", "opencode",
    }
)

# A query that says "alternatives to X" / "vs Y" wants discovery, not docs.
DISCOVERY_PATTERNS: Tuple[re.Pattern, ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\balternatives?\s+to\b",
        r"\bsimilar\s+to\b",
        r"\b(vs\.?|versus)\b",
        r"\b(find\s+me|find|look\s+up)\s+(papers?|projects?|libraries?|tools?|companies?|people)\b",
        r"\b(papers?|research)\s+(on|about)\b",
        r"\b(competitors?|comparison|landscape|survey)\b",
        r"\b(libraries?|tools?|projects?)\s+like\b",
        r"\b(compare|comparing|differences?\s+between)\b",
    )
)

# Time-sensitive cues push toward general web search.
TIME_PATTERNS: Tuple[re.Pattern, ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\b(today|tonight|tomorrow|yesterday|now|currently|recent(ly)?|latest|"
        r"news|updates?|changelog|release\s+notes?|roadmap|announcement)\b",
        r"\b20[2-9]\d\b",  # year 2020-2099
        r"\b(price|pricing|cost|fees?)\b",
        r"\bversion\s+\d",
    )
)

URL_RE = re.compile(r"^\s*https?://", re.IGNORECASE)


# --- Decision schema ------------------------------------------------------


@dataclass
class RouteDecision:
    intent: str
    classifier_version: str
    recommended_op: str          # docs|discover|fetch|crawl|search
    recommended_provider: str    # context7|exa|firecrawl|tavily|...
    confidence: float
    ambiguous: bool
    rationale: str               # short reason for the chosen op
    rules_fired: List[str] = field(default_factory=list)
    why_not: List[Dict[str, str]] = field(default_factory=list)
    search_budget: int = 1       # how many provider calls plan should permit

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


_OP_TO_PROVIDER = {
    "docs": "context7",
    "discover": "exa",
    "fetch": "firecrawl",
    "crawl": "firecrawl",
    "search": "tavily",
}

_OP_TO_INTENT = {
    "docs": "library_docs",
    "discover": "semantic_discovery",
    "fetch": "url_fetch",
    "crawl": "url_crawl",
    "search": "web_facts",
}


class Router(Protocol):
    classifier_version: str

    def classify(self, query: str, context: Optional[Dict[str, Any]] = None) -> RouteDecision: ...


class RuleRouter:
    classifier_version = "rule-v1"

    def classify(self, query: str, context: Optional[Dict[str, Any]] = None) -> RouteDecision:
        q = (query or "").strip()
        candidates: List[Tuple[str, float, str]] = []

        # 1. URL → fetch (or crawl, if the user typed a wildcard / trailing /*).
        if URL_RE.match(q):
            op = "crawl" if (q.endswith("/*") or "/**" in q) else "fetch"
            candidates.append((op, 0.95, f"url_detected → {op}"))

        # 2. Known libraries.
        tokens = re.findall(r"[a-z][a-z0-9_-]+", q.lower())
        library_hits = [t for t in tokens if t in KNOWN_LIBRARIES]

        discovery_hit = any(p.search(q) for p in DISCOVERY_PATTERNS)
        time_hit = any(p.search(q) for p in TIME_PATTERNS)

        if library_hits and discovery_hit:
            # Library + discovery hint → user wants alternatives, not docs.
            candidates.append(
                (
                    "discover",
                    0.85,
                    f"library({library_hits[0]}) + discovery_phrase",
                )
            )
        elif library_hits and time_hit:
            # Library + time-sensitive cue (price/news/release notes/latest):
            # the user is asking about *current state*, not how-to. Search wins
            # but mark ambiguous so plan can opt to also hit docs.
            candidates.append(
                ("search", 0.75, f"time_phrase + library({library_hits[0]}) → current state")
            )
            candidates.append(
                ("docs", 0.7, f"library({library_hits[0]}) (alt: docs may also have it)")
            )
        elif library_hits:
            candidates.append(("docs", 0.85, f"library_hit({library_hits[0]})"))

        if discovery_hit and not library_hits:
            candidates.append(("discover", 0.8, "discovery_phrase"))

        if time_hit and not library_hits:
            candidates.append(("search", 0.75, "time_phrase"))

        if not candidates:
            candidates.append(("search", 0.4, "default_fallback"))

        # Choose the highest-confidence op.
        candidates.sort(key=lambda c: -c[1])
        chosen_op, chosen_conf, chosen_reason = candidates[0]

        # Mark ambiguous if two or more strong candidates target different ops.
        strong = [c for c in candidates if c[1] >= 0.5]
        unique_ops = {c[0] for c in strong}
        ambiguous = len(unique_ops) > 1
        confidence = min(chosen_conf, 0.5) if ambiguous else chosen_conf

        why_not = [
            {"op": op, "reason": reason}
            for op, _, reason in candidates[1:]
            if op != chosen_op
        ]

        # Plan budget: small for unambiguous specific ops, larger when we may need
        # cross-validation.
        budget = 1
        if ambiguous:
            budget = 2
        if context and context.get("prefer") == "deep":
            budget = max(budget, 3)
        if context and context.get("budget_override"):
            budget = int(context["budget_override"])

        return RouteDecision(
            intent=_OP_TO_INTENT[chosen_op],
            classifier_version=self.classifier_version,
            recommended_op=chosen_op,
            recommended_provider=_OP_TO_PROVIDER[chosen_op],
            confidence=round(confidence, 2),
            ambiguous=ambiguous,
            rationale=chosen_reason,
            rules_fired=[f"{op}({conf:.2f}): {reason}" for op, conf, reason in candidates],
            why_not=why_not,
            search_budget=budget,
        )


class LlmRouter:
    classifier_version = "llm-haiku-v1"

    def classify(
        self, query: str, context: Optional[Dict[str, Any]] = None
    ) -> RouteDecision:
        raise NotImplementedError(
            "LlmRouter ships in v0.2. Use RuleRouter (default) for now."
        )


def get_router(name: str = "rule") -> Router:
    if name == "rule":
        return RuleRouter()
    if name == "llm":
        return LlmRouter()
    raise ValueError(f"unknown router: {name!r} (use rule|llm)")
