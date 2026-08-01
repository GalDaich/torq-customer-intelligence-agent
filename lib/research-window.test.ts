import { describe, expect, it } from "vitest";
import {
  createResearchWindow,
  filterCorpusToResearchWindow,
  sourceIsWithinResearchWindow,
} from "./research-window";

const window = {
  today: "2026-08-01",
  oneYearAgo: "2025-08-01",
};

describe("research evidence window", () => {
  it("uses the runtime UTC date and exactly one calendar year back", () => {
    expect(createResearchWindow(new Date("2026-08-01T23:59:59.000Z"))).toEqual(window);
    expect(createResearchWindow(new Date("2024-02-29T12:00:00.000Z"))).toEqual({
      today: "2024-02-29",
      oneYearAgo: "2023-02-28",
    });
  });

  it("accepts both date boundaries and rejects old, future, invalid, and undated sources", () => {
    expect(sourceIsWithinResearchWindow("2025-08-01", window)).toBe(true);
    expect(sourceIsWithinResearchWindow("2026-08-01T23:00:00.000Z", window)).toBe(true);
    expect(sourceIsWithinResearchWindow("2025-07-31", window)).toBe(false);
    expect(sourceIsWithinResearchWindow("2026-08-02", window)).toBe(false);
    expect(sourceIsWithinResearchWindow("not-a-date", window)).toBe(false);
    expect(sourceIsWithinResearchWindow(null, window)).toBe(false);
  });

  it("removes evidence linked to sources outside the window", () => {
    const corpus = filterCorpusToResearchWindow(
      {
        sources: [
          {
            id: "S1",
            title: "Current announcement",
            url: "https://acme.example/news/current",
            publisher: "acme.example",
            sourceType: "news" as const,
            publishedAt: "2026-03-10",
          },
          {
            id: "S2",
            title: "Old announcement",
            url: "https://acme.example/news/old",
            publisher: "acme.example",
            sourceType: "news" as const,
            publishedAt: "2021-03-10",
          },
        ],
        evidence: [
          {
            id: "E1",
            sourceId: "S1",
            excerpt: "Current evidence.",
            collectedAt: "2026-08-01T09:00:00.000Z",
          },
          {
            id: "E2",
            sourceId: "S2",
            excerpt: "Old evidence.",
            collectedAt: "2026-08-01T09:00:00.000Z",
          },
        ],
      },
      window,
    );

    expect(corpus.sources.map((source) => source.id)).toEqual(["S1"]);
    expect(corpus.evidence.map((item) => item.id)).toEqual(["E1"]);
  });
});
