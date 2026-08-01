import { z } from "zod";
import {
  canonicalEvidenceUrl,
  evidenceFingerprint,
  isGenericEvidenceSource,
} from "./evidence-quality";
import { logBackend } from "./logger";
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

export type ResearchCorpus = {
  sources: Source[];
  evidence: Evidence[];
};

type ProviderLogContext = {
  researchId?: string;
  companyName?: string;
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
}

async function loggedProviderCall<T>(
  provider: "Tavily" | "Firecrawl",
  operation: string,
  context: ProviderLogContext | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  logBackend({
    level: "info",
    event: "provider_request_started",
    message: `${provider} ${operation} request started.`,
    provider,
    operation,
    stage: "provider",
    status: "started",
    ...context,
  });
  try {
    const result = await run();
    logBackend({
      level: "info",
      event: "provider_request_completed",
      message: `${provider} ${operation} request completed.`,
      provider,
      operation,
      stage: "provider",
      status: "completed",
      durationMs: Date.now() - startedAt,
      ...context,
    });
    return result;
  } catch (error) {
    logBackend({
      level: "error",
      event: "provider_request_failed",
      message: error instanceof ProviderError ? error.message : `${provider} ${operation} request failed.`,
      provider,
      operation,
      stage: "provider",
      status: "failed",
      durationMs: Date.now() - startedAt,
      ...context,
    });
    throw error;
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
  input: {
    query: string;
    idPrefix: string;
    sourceType: Source["sourceType"];
    maxResults?: number;
    topic?: "general" | "news";
    days?: number;
    includeDomains?: string[];
    logContext?: ProviderLogContext;
  },
  options: { apiKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<ResearchCorpus> {
  return loggedProviderCall("Tavily", `search:${input.idPrefix}`, input.logContext, async () => {
    const apiKey = options.apiKey ?? requireServerEnv("TAVILY_API_KEY");
    const payload = await providerJson(
    "Tavily",
    "https://api.tavily.com/search",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: input.query,
        topic: input.topic ?? "general",
        search_depth: "basic",
        max_results: input.maxResults ?? 5,
        include_answer: false,
        include_raw_content: false,
        ...(input.days ? { days: input.days } : {}),
        ...(input.includeDomains ? { include_domains: input.includeDomains } : {}),
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
    if (isGenericEvidenceSource({
      sourceType: input.sourceType,
      title: result.title,
      url: canonicalUrl,
    })) {
      continue;
    }
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

    const excerpt = result.content.replace(/\s+/g, " ").trim().slice(0, 1200);
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
  });
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
    logContext?: ProviderLogContext;
  },
  options: { apiKey?: string; fetchImpl?: typeof fetch } = {},
): Promise<ResearchCorpus> {
  return loggedProviderCall("Firecrawl", `scrape:${input.idPrefix}`, input.logContext, async () => {
    const apiKey = options.apiKey ?? requireServerEnv("FIRECRAWL_API_KEY");
    const payload = await providerJson(
    "Firecrawl",
    "https://api.firecrawl.dev/v2/scrape",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: input.url,
        formats: ["markdown"],
        onlyMainContent: true,
        removeBase64Images: true,
        blockAds: true,
      }),
    },
    options.fetchImpl ?? fetch,
  );

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
  });
}

export function mergeCorpora(corpora: ResearchCorpus[]): ResearchCorpus {
  const sources: Source[] = [];
  const evidence: Evidence[] = [];
  const seenUrls = new Set<string>();
  const seenEvidence = new Set<string>();

  for (const corpus of corpora) {
    const evidenceBySource = new Map<string, Evidence[]>();
    for (const item of corpus.evidence) {
      const items = evidenceBySource.get(item.sourceId) ?? [];
      items.push(item);
      evidenceBySource.set(item.sourceId, items);
    }

    for (const source of corpus.sources) {
      const canonicalUrl = canonicalEvidenceUrl(source.url);
      if (seenUrls.has(canonicalUrl)) continue;

      const uniqueEvidence = (evidenceBySource.get(source.id) ?? []).filter((item) => {
        const fingerprint = evidenceFingerprint(item.excerpt);
        if (!fingerprint || seenEvidence.has(fingerprint)) return false;
        seenEvidence.add(fingerprint);
        return true;
      });
      if (uniqueEvidence.length === 0) continue;

      seenUrls.add(canonicalUrl);
      sources.push({ ...source, url: canonicalUrl, publisher: publisherFor(canonicalUrl) });
      evidence.push(...uniqueEvidence);
    }
  }

  return { sources, evidence };
}

export function publicErrorMessage(error: unknown): string {
  if (error instanceof ProviderError) return error.message;
  if (error instanceof ProtectedBoundaryError) return error.message;
  if (error instanceof Error && error.message.startsWith("Missing required server environment variable:")) {
    return error.message;
  }
  if (error instanceof Error && error.message.startsWith("LANGSMITH_TRACING")) return error.message;
  return "Research failed at a protected provider or validation boundary.";
}
