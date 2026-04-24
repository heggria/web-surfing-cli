/** Provider registry — single place to instantiate providers from config. */

import { isDisabled, loadKeys, PROVIDERS } from "../config.js";
import { BraveProvider } from "./brave.js";
import { Context7Provider } from "./context7.js";
import { DuckDuckGoProvider } from "./duckduckgo.js";
import { ExaProvider } from "./exa.js";
import { FirecrawlProvider } from "./firecrawl.js";
import { TavilyProvider } from "./tavily.js";
import { DisabledError, MissingKeyError, Provider } from "./base.js";

const FACTORY: Record<string, new (apiKey?: string) => Provider> = {
  context7: Context7Provider,
  exa: ExaProvider,
  tavily: TavilyProvider,
  firecrawl: FirecrawlProvider,
  brave: BraveProvider,
  duckduckgo: DuckDuckGoProvider,
};

const KEY_OPTIONAL = new Set(["context7", "duckduckgo"]);

export function getProvider(name: string): Provider {
  if (!(name in FACTORY)) throw new Error(`unknown provider: ${name}`);
  if (!(name in PROVIDERS)) throw new Error(`provider not in catalog: ${name}`);
  if (isDisabled(name)) throw new DisabledError(name);
  const keys = loadKeys();
  const Cls = FACTORY[name]!;
  if (KEY_OPTIONAL.has(name)) {
    return new Cls(keys.get(name));
  }
  const apiKey = keys.get(name);
  if (!apiKey) throw new MissingKeyError(name);
  return new Cls(apiKey);
}

export * from "./base.js";
export { BraveProvider } from "./brave.js";
export { Context7Provider } from "./context7.js";
export { DuckDuckGoProvider } from "./duckduckgo.js";
export { ExaProvider } from "./exa.js";
export { FirecrawlProvider } from "./firecrawl.js";
export { TavilyProvider } from "./tavily.js";
