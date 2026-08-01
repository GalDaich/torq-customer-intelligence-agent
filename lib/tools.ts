import { z } from "zod";
import {
  canonicalEvidenceUrl,
  evidenceFingerprint,
} from "./evidence-quality";
import {
  EvidenceSchema,
  SourceSchema,
  type Evidence,
  type Source,
} from "./schemas";

const TavilyResponseSchema = z
  .object({
    results: z.array(
      z
        .object({
          title: z.string().catch("Untitled source"),
          url: z.string().url(),
          content: z.string().catch(""),
          score: z.number().optional(),
          published_date: z.string().nullish(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const FirecrawlResponseSchema = z
  .object({
    success: z.boolean(),
    data: z
      .object({
        markdown: z.string().optional(),
        metadata: z
          .object({
            title: z.string().optional(),
            sourceURL: z.string().url().optional(),
            url: z.string().url().optional(),
            publishedTime: z.string().optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const FirecrawlMapResponseSchema = z
  .object({
    success: z.boolean(),
    links: z.array(
      z.object({
        url: z.string().url(),
        title: z.string().catch(""),
        description: z.string().catch(""),
      }).passthrough(),
    ),
  })
  .passthrough();

export type TavilySearchInput = {
  query: string;
  idPrefix: string;
  sourceType: Source["sourceType"];
  maxResults?: number;
  topic?: "general" | "news";
  searchDepth?: "basic" | "advanced" | "fast" | "ultra-fast";
  chunksPerSource?: 1 | 2 | 3;
  includeDomains?: string[];
  excludeDomains?: string[];
  signal?: AbortSignal;
};

type FirecrawlMapLink = z.infer<typeof FirecrawlMapResponseSchema>["links"][number];

export const FIRECRAWL_FREE_TIER_LIMITS = {
  maxConcurrency: 2,
  requestsPerMinute: {
    map: 10,
    scrape: 10,
  },
  windowMs: 60_000,
} as const;

type RequestBudgetBucket = keyof typeof FIRECRAWL_FREE_TIER_LIMITS.requestsPerMinute;

export class RequestBudgetGate {
  private active = 0;
  private readonly waiters: Array<() => void> = [];
  private readonly requestTimes = new Map<RequestBudgetBucket, number[]>();

  constructor(
    private readonly maxConcurrency: number,
    private readonly requestsPerWindow: Record<RequestBudgetBucket, number>,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly sleep: (durationMs: number) => Promise<void> =
      (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs)),
  ) {}

  private async acquireConcurrency(): Promise<void> {
    // Waiting requests receive the released slot directly, so `active` never exceeds
    // the provider's free-tier concurrency allowance.
    if (this.active < this.maxConcurrency) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  private releaseConcurrency(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.active -= 1;
  }

  private async reserveRateSlot(bucket: RequestBudgetBucket): Promise<void> {
    while (true) {
      const now = this.now();
      const cutoff = now - this.windowMs;
      const recent = (this.requestTimes.get(bucket) ?? []).filter((time) => time > cutoff);
      if (recent.length < this.requestsPerWindow[bucket]) {
        recent.push(now);
        this.requestTimes.set(bucket, recent);
        return;
      }
      await this.sleep(Math.max(1, recent[0] + this.windowMs - now));
    }
  }

  async run<T>(bucket: RequestBudgetBucket, request: () => Promise<T>): Promise<T> {
    await this.acquireConcurrency();
    try {
      await this.reserveRateSlot(bucket);
      return await request();
    } finally {
      this.releaseConcurrency();
    }
  }
}

const firecrawlFreeTierGate = new RequestBudgetGate(
  FIRECRAWL_FREE_TIER_LIMITS.maxConcurrency,
  FIRECRAWL_FREE_TIER_LIMITS.requestsPerMinute,
  FIRECRAWL_FREE_TIER_LIMITS.windowMs,
);

export type ResearchCorpus = {
  sources: Source[];
  evidence: Evidence[];
};

export class ProviderError extends Error {
  readonly provider: "Tavily" | "Firecrawl";
  readonly status: number | undefined;

  constructor(provider: "Tavily" | "Firecrawl", message: string, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.provider = provider;
    this.status = status;
  }
}

export class ProtectedBoundaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProtectedBoundaryError";
  }
}

export function httpErrorStatus(error: unknown): number | undefined {
  if (error instanceof ProviderError) return error.status;
  if (typeof error !== "object" || error === null) return undefined;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  if (typeof candidate.status === "number") return candidate.status;
  return typeof candidate.statusCode === "number" ? candidate.statusCode : undefined;
}

export function isProviderClientError(error: unknown): boolean {
  const status = httpErrorStatus(error);
  return status !== undefined && status >= 400 && status < 500;
}

export function requireServerEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}.`);
  }
  return value;
}

export function assertResearchEnvironment(): void {
  for (const name of ["OPENAI_API_KEY", "OPENAI_MODEL", "TAVILY_API_KEY", "FIRECRAWL_API_KEY"]) {
    requireServerEnv(name);
  }
  assertLangSmithEnvironment();
}

export function assertResolutionEnvironment(): void {
  for (const name of ["OPENAI_API_KEY", "OPENAI_MODEL", "TAVILY_API_KEY"]) {
    requireServerEnv(name);
  }
  assertLangSmithEnvironment();
}

function assertLangSmithEnvironment(): void {
  requireServerEnv("LANGSMITH_API_KEY");
  requireServerEnv("LANGSMITH_PROJECT");
  if (process.env.LANGSMITH_TRACING !== "true") {
    throw new Error("LANGSMITH_TRACING must be true for traceable LLM operations.");
  }
  for (const name of [
    "LANGCHAIN_CALLBACKS_BACKGROUND",
    "LANGSMITH_TRACING_BACKGROUND",
  ]) {
    if (process.env[name] !== "false") {
      throw new Error(`${name} must be false so serverless trace updates finish.`);
    }
  }
}

function publisherFor(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

async function providerJson(
  provider: "Tavily" | "Firecrawl",
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch {
    throw new ProviderError(provider, `${provider} could not be reached.`);
  }

  if (!response.ok) {
    throw new ProviderError(
      provider,
      `${provider} request failed with status ${response.status}.`,
      response.status,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new ProviderError(provider, `${provider} returned an invalid response.`);
  }
}

export async function searchTavily(
  input: TavilySearchInput,
  options: { apiKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<ResearchCorpus> {
  // Provider-specific JSON is converted here into the small Source/Evidence contract
  // used everywhere else. Raw Tavily payloads never reach prompts or the browser.
  const apiKey = options.apiKey ?? requireServerEnv("TAVILY_API_KEY");
  const payload = await providerJson(
    "Tavily",
    "https://api.tavily.com/search",
    {
      method: "POST",
      signal: input.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: input.query,
        topic: input.topic ?? "general",
        search_depth: input.searchDepth ?? "basic",
        max_results: input.maxResults ?? 5,
        include_answer: false,
        include_raw_content: false,
        ...(input.searchDepth === "advanced" && input.chunksPerSource
          ? { chunks_per_source: input.chunksPerSource }
          : {}),
        ...(input.includeDomains ? { include_domains: input.includeDomains } : {}),
        ...(input.excludeDomains ? { exclude_domains: input.excludeDomains } : {}),
      }),
    },
    options.fetchImpl ?? fetch,
  );

  const parsed = TavilyResponseSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ProviderError("Tavily", "Tavily returned an unexpected response shape.");
  }

  const collectedAt = new Date().toISOString();
  const sources: Source[] = [];
  const evidence: Evidence[] = [];
  const seenUrls = new Set<string>();

  for (const result of parsed.data.results) {
    const canonicalUrl = canonicalEvidenceUrl(result.url);
    if (seenUrls.has(canonicalUrl)) continue;
    seenUrls.add(canonicalUrl);
    const ordinal = sources.length + 1;
    const source = SourceSchema.parse({
      id: `${input.idPrefix}-S${ordinal}`,
      title: result.title.trim() || publisherFor(result.url),
      url: canonicalUrl,
      publisher: publisherFor(canonicalUrl),
      sourceType: input.sourceType,
      publishedAt: result.published_date ?? null,
    });
    sources.push(source);

    const excerpt = result.content
      .replace(/<\/?chunk\s*\d*>/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1600);
    if (excerpt) {
      evidence.push(
        EvidenceSchema.parse({
          id: `${input.idPrefix}-E${evidence.length + 1}`,
          sourceId: source.id,
          excerpt,
          collectedAt,
        }),
      );
    }
  }

  return { sources, evidence };
}

export async function mapFirecrawl(
  input: {
    url: string;
    search: string;
    limit?: number;
    includeSubdomains?: boolean;
    signal?: AbortSignal;
  },
  options: { apiKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<FirecrawlMapLink[]> {
  const apiKey = options.apiKey ?? requireServerEnv("FIRECRAWL_API_KEY");
  const request = () => providerJson(
    "Firecrawl",
    "https://api.firecrawl.dev/v2/map",
    {
      method: "POST",
      signal: input.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: input.url,
        search: input.search,
        sitemap: "include",
        includeSubdomains: input.includeSubdomains ?? false,
        ignoreQueryParameters: true,
        limit: input.limit ?? 5,
        timeout: 30_000,
      }),
    },
    options.fetchImpl ?? fetch,
  );
  const payload = options.fetchImpl
    ? await request()
    : await firecrawlFreeTierGate.run("map", request);
  const parsed = FirecrawlMapResponseSchema.safeParse(payload);
  if (!parsed.success || !parsed.data.success) {
    throw new ProviderError("Firecrawl", "Firecrawl could not map the official website.");
  }
  return parsed.data.links;
}

function markdownExcerpts(markdown: string): string[] {
  const paragraphs = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .split(/\n\s*\n/)
    .map((part) => part.replace(/[#*_`>|\[\]]/g, " ").replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 80);

  return paragraphs.slice(0, 4).map((part) => part.slice(0, 1200));
}

export async function scrapeFirecrawl(
  input: {
    url: string;
    idPrefix: string;
    sourceType: Source["sourceType"];
    maxAge?: number;
    signal?: AbortSignal;
  },
  options: { apiKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<ResearchCorpus> {
  // Mapping chooses candidate pages; scraping reads only a bounded page set and returns
  // the same normalized corpus shape as Tavily.
  const apiKey = options.apiKey ?? requireServerEnv("FIRECRAWL_API_KEY");
  const request = () => providerJson(
    "Firecrawl",
    "https://api.firecrawl.dev/v2/scrape",
    {
      method: "POST",
      signal: input.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: input.url,
        formats: ["markdown"],
        onlyMainContent: true,
        onlyCleanContent: false,
        removeBase64Images: true,
        blockAds: true,
        excludeTags: ["nav", "footer", "aside", "form"],
        maxAge: input.maxAge ?? 86_400_000,
      }),
    },
    options.fetchImpl ?? fetch,
  );
  const payload = options.fetchImpl
    ? await request()
    : await firecrawlFreeTierGate.run("scrape", request);

  const parsed = FirecrawlResponseSchema.safeParse(payload);
  if (!parsed.success || !parsed.data.success || !parsed.data.data?.markdown) {
    throw new ProviderError("Firecrawl", "Firecrawl did not return readable page content.");
  }

  const metadata = parsed.data.data.metadata;
  const sourceUrl = metadata?.sourceURL ?? metadata?.url ?? input.url;
  const source = SourceSchema.parse({
    id: `${input.idPrefix}-S1`,
    title: metadata?.title?.trim() || publisherFor(sourceUrl),
    url: sourceUrl,
    publisher: publisherFor(sourceUrl),
    sourceType: input.sourceType,
    publishedAt: metadata?.publishedTime ?? null,
  });
  const collectedAt = new Date().toISOString();
  const evidence = markdownExcerpts(parsed.data.data.markdown).map((excerpt, index) =>
    EvidenceSchema.parse({
      id: `${input.idPrefix}-E${index + 1}`,
      sourceId: source.id,
      excerpt,
      collectedAt,
    }),
  );

  return { sources: [source], evidence };
}

export function mergeCorpora(corpora: ResearchCorpus[]): ResearchCorpus {
  // Canonical URLs and excerpt fingerprints prevent the same underlying evidence from
  // being counted twice when several specialist searches find it independently.
  const sources: Source[] = [];
  const evidence: Evidence[] = [];
  const seenUrls = new Set<string>();
  const seenEvidence = new Set<string>();
  const sourceIdByUrl = new Map<string, string>();

  for (const corpus of corpora) {
    const evidenceBySource = new Map<string, Evidence[]>();
    for (const item of corpus.evidence) {
      const items = evidenceBySource.get(item.sourceId) ?? [];
      items.push(item);
      evidenceBySource.set(item.sourceId, items);
    }

    for (const source of corpus.sources) {
      const canonicalUrl = canonicalEvidenceUrl(source.url);
      const retainedSourceId = sourceIdByUrl.get(canonicalUrl) ?? source.id;

      const uniqueEvidence = (evidenceBySource.get(source.id) ?? []).filter((item) => {
        const fingerprint = evidenceFingerprint(item.excerpt);
        if (!fingerprint || seenEvidence.has(fingerprint)) return false;
        seenEvidence.add(fingerprint);
        return true;
      });
      if (uniqueEvidence.length === 0) continue;

      if (!seenUrls.has(canonicalUrl)) {
        seenUrls.add(canonicalUrl);
        sourceIdByUrl.set(canonicalUrl, source.id);
        sources.push({ ...source, url: canonicalUrl, publisher: publisherFor(canonicalUrl) });
      }
      evidence.push(...uniqueEvidence.map((item) => ({ ...item, sourceId: retainedSourceId })));
    }
  }

  return { sources, evidence };
}

export function publicErrorMessage(error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  const status = httpErrorStatus(error);
  if (status !== undefined && status >= 400 && status < 500) {
    return `A provider request failed with status ${status}.`;
  }
  if (error instanceof ProtectedBoundaryError) return error.message;
  if (error instanceof Error && error.message.startsWith("Missing required server environment variable:")) {
    return error.message;
  }
  if (error instanceof Error && error.message.startsWith("LANGSMITH_TRACING")) return error.message;
  if (
    error instanceof Error &&
    error.message.startsWith("LANGCHAIN_CALLBACKS_BACKGROUND")
  ) {
    return error.message;
  }
  return "Research failed at a protected provider or validation boundary.";
}
