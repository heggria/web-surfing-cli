/**
 * Source-domain shortcuts for `--source hn|reddit|x|gh|so` and combinations.
 *
 * `--source hn+reddit` → expand to ["news.ycombinator.com", "reddit.com", "old.reddit.com"].
 * Combined with `--include-domain` (repeatable) for explicit additions.
 */

export const SOURCE_PRESETS: Record<string, string[]> = {
  hn: ["news.ycombinator.com"],
  reddit: ["reddit.com", "old.reddit.com"],
  x: ["x.com", "twitter.com"],
  gh: ["github.com"],
  so: ["stackoverflow.com", "stackexchange.com"],
  arxiv: ["arxiv.org"],
};

/**
 * Expand a source spec like "hn", "hn+reddit", or "hn+gh+so" into a flat list
 * of unique domains. Unknown segments are passed through verbatim so users can
 * mix presets and ad-hoc domains: `--source hn+example.com`.
 */
export function expandSource(spec: string | undefined): string[] {
  if (!spec) return [];
  const segs = spec.split("+").map((s) => s.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of segs) {
    const list = SOURCE_PRESETS[s] ?? [s];
    for (const d of list) {
      if (!seen.has(d)) {
        seen.add(d);
        out.push(d);
      }
    }
  }
  return out;
}

/**
 * Combine `--source <preset>` with one-or-more `--include-domain <d>` flags.
 * Returns undefined when no constraint is set, so callers don't pass an empty
 * array to providers (avoids accidentally over-restricting).
 */
export function resolveIncludeDomains(
  source: string | undefined,
  include: string[] | undefined,
): string[] | undefined {
  const expanded = expandSource(source);
  const merged = [...expanded, ...(include ?? [])];
  if (merged.length === 0) return undefined;
  // Dedupe while preserving order.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of merged) {
    if (!seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  }
  return out;
}
