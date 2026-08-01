import { describe, expect, it, vi } from "vitest";
import {
  mapFirecrawl,
  mergeCorpora,
  ProviderError,
  scrapeFirecrawl,
  searchTavily,
} from "./tools";

describe("provider normalization", () => {
  it("creates Tavily source and evidence records without leaking raw fields", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        results: [
          {
            title: "Acme News",
            url: "https://news.example/acme",
            content: "Acme announced a security automation product.",
            score: 0.91,
            provider_secret: "discard me",
          },
        ],
        request_id: "discard me too",
      }),
    );

    const corpus = await searchTavily(
      { query: "Acme", idPrefix: "REC1", sourceType: "news" },
      { apiKey: "test-key", fetchImpl },
    );

    expect(corpus.sources).toEqual([
      {
        id: "REC1-S1",
        title: "Acme News",
        url: "https://news.example/acme",
        publisher: "news.example",
        sourceType: "news",
        publishedAt: null,
      },
    ]);
    expect(corpus.evidence[0]).toMatchObject({
      id: "REC1-E1",
      sourceId: "REC1-S1",
      excerpt: "Acme announced a security automation product.",
    });
    expect(corpus).not.toHaveProperty("request_id");
  });

  it("sends precision options and removes low-score Tavily results", async () => {
    let requestBody: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        results: [
          {
            title: "Strong specific result",
            url: "https://news.example/acme-specific",
            content: "<chunk 1>Acme announced a specific product launch.</chunk 1>",
            score: 0.83,
          },
          {
            title: "Weak result",
            url: "https://noise.example/acme",
            content: "Weakly related content.",
            score: 0.2,
          },
        ],
      });
    });

    const corpus = await searchTavily(
      {
        query: "Acme launch",
        idPrefix: "REC1",
        sourceType: "news",
        searchDepth: "advanced",
        chunksPerSource: 2,
        timeRange: "year",
        excludeDomains: ["noise.example"],
        minimumScore: 0.45,
      },
      { apiKey: "test-key", fetchImpl },
    );

    expect(requestBody).toMatchObject({
      search_depth: "advanced",
      chunks_per_source: 2,
      time_range: "year",
      exclude_domains: ["noise.example"],
      include_answer: false,
      include_raw_content: false,
    });
    expect(corpus.sources.map((source) => source.title)).toEqual(["Strong specific result"]);
    expect(corpus.evidence[0].excerpt).not.toContain("<chunk");
  });

  it("uses Firecrawl map to discover a bounded official-site target set", async () => {
    let requestBody: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        success: true,
        links: [{
          url: "https://acme.example/platform",
          title: "Acme platform",
          description: "Platform overview",
        }],
      });
    });

    const links = await mapFirecrawl(
      { url: "https://acme.example", search: "products platform", limit: 10 },
      { apiKey: "test-key", fetchImpl },
    );

    expect(requestBody).toMatchObject({
      search: "products platform",
      sitemap: "include",
      includeSubdomains: false,
      ignoreQueryParameters: true,
      limit: 10,
    });
    expect(links[0].url).toBe("https://acme.example/platform");
  });

  it("creates excerpts only from Firecrawl markdown", async () => {
    let requestBody: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        success: true,
        data: {
          markdown:
            "# Acme\n\nAcme builds a platform that automates security operations across cloud environments and enterprise systems.",
          metadata: { title: "Acme", sourceURL: "https://acme.example" },
          html: "discard raw html",
        },
      });
    });

    const corpus = await scrapeFirecrawl(
      { url: "https://acme.example", idPrefix: "FP1", sourceType: "company" },
      { apiKey: "test-key", fetchImpl },
    );

    expect(corpus.sources[0].url).toBe("https://acme.example");
    expect(corpus.evidence[0].excerpt).toContain("automates security operations");
    expect(requestBody).toMatchObject({
      formats: ["markdown"],
      onlyMainContent: true,
      onlyCleanContent: false,
      excludeTags: ["nav", "footer", "aside", "form"],
      maxAge: 86_400_000,
    });
  });

  it("rejects generic hiring pages before they become evidence", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        results: [
          {
            title: "Careers at Acme",
            url: "https://acme.example/careers",
            content: "Explore opportunities and join our team.",
          },
          {
            title: "Security Engineer",
            url: "https://acme.example/careers/security-engineer-123",
            content: "Acme is hiring a Security Engineer for its cloud security team.",
          },
        ],
      }),
    );

    const corpus = await searchTavily(
      { query: "Acme security jobs", idPrefix: "HIR1", sourceType: "hiring" },
      { apiKey: "test-key", fetchImpl },
    );

    expect(corpus.sources).toHaveLength(1);
    expect(corpus.sources[0].title).toBe("Security Engineer");
    expect(corpus.sources[0].url).toBe("https://acme.example/careers/security-engineer-123");
  });

  it("deduplicates canonical URLs and repeated excerpts across corpora", () => {
    const collectedAt = "2026-08-01T09:00:00.000Z";
    const corpus = mergeCorpora([
      {
        sources: [{
          id: "A-S1",
          title: "Acme announcement",
          url: "https://www.news.example/acme?utm_source=test",
          publisher: "news.example",
          sourceType: "news",
          publishedAt: null,
        }],
        evidence: [{
          id: "A-E1",
          sourceId: "A-S1",
          excerpt: "Acme announced a security automation product.",
          collectedAt,
        }],
      },
      {
        sources: [{
          id: "B-S1",
          title: "Acme announcement copy",
          url: "https://news.example/acme#summary",
          publisher: "news.example",
          sourceType: "news",
          publishedAt: null,
        }],
        evidence: [{
          id: "B-E1",
          sourceId: "B-S1",
          excerpt: "Acme announced a security automation product.",
          collectedAt,
        }],
      },
    ]);

    expect(corpus.sources).toHaveLength(1);
    expect(corpus.evidence).toHaveLength(1);
    expect(corpus.sources[0].url).toBe("https://news.example/acme");
  });

  it("retains distinct evidence from one canonical page and remaps it to one source", () => {
    const collectedAt = "2026-08-01T09:00:00.000Z";
    const corpus = mergeCorpora([
      {
        sources: [{
          id: "HIR-S1",
          title: "Security Engineer",
          url: "https://acme.example/jobs/security-engineer",
          publisher: "acme.example",
          sourceType: "hiring",
          publishedAt: null,
        }],
        evidence: [{
          id: "HIR-E1",
          sourceId: "HIR-S1",
          excerpt: "Acme is hiring a Security Engineer.",
          collectedAt,
        }],
      },
      {
        sources: [{
          id: "TEC-S1",
          title: "Security Engineer",
          url: "https://www.acme.example/jobs/security-engineer?utm_source=search",
          publisher: "acme.example",
          sourceType: "technology",
          publishedAt: null,
        }],
        evidence: [{
          id: "TEC-E1",
          sourceId: "TEC-S1",
          excerpt: "The role requires experience with Splunk and CrowdStrike.",
          collectedAt,
        }],
      },
    ]);

    expect(corpus.sources).toHaveLength(1);
    expect(corpus.evidence).toHaveLength(2);
    expect(corpus.evidence.map((item) => item.sourceId)).toEqual(["HIR-S1", "HIR-S1"]);
  });

  it("turns provider status failures into sanitized errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("bad key details", { status: 401 }));

    await expect(
      searchTavily(
        { query: "Acme", idPrefix: "RES", sourceType: "other" },
        { apiKey: "invalid", fetchImpl },
      ),
    ).rejects.toEqual(
      new ProviderError("Tavily", "Tavily request failed with status 401.", 401),
    );
  });
});
