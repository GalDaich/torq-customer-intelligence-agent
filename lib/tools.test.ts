import { describe, expect, it, vi } from "vitest";
import { mergeCorpora, ProviderError, scrapeFirecrawl, searchTavily } from "./tools";

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

  it("creates excerpts only from Firecrawl markdown", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({
        success: true,
        data: {
          markdown:
            "# Acme\n\nAcme builds a platform that automates security operations across cloud environments and enterprise systems.",
          metadata: { title: "Acme", sourceURL: "https://acme.example" },
          html: "discard raw html",
        },
      }),
    );

    const corpus = await scrapeFirecrawl(
      { url: "https://acme.example", idPrefix: "FP1", sourceType: "company" },
      { apiKey: "test-key", fetchImpl },
    );

    expect(corpus.sources[0].url).toBe("https://acme.example");
    expect(corpus.evidence[0].excerpt).toContain("automates security operations");
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
