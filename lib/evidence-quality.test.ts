import { describe, expect, it } from "vitest";
import type { GroundedClaim } from "./schemas";
import {
  canonicalEvidenceUrl,
  retainEvidenceForClaims,
  type EvidenceCorpus,
} from "./evidence-quality";

const corpus: EvidenceCorpus = {
  sources: [
    { id: "S1", title: "Acme careers", url: "https://acme.example/careers", publisher: "acme.example", sourceType: "hiring", publishedAt: null },
    { id: "S2", title: "Acme stack", url: "https://stack.example/acme", publisher: "stack.example", sourceType: "technology", publishedAt: "2021-04-01" },
  ],
  evidence: [
    { id: "E1", sourceId: "S1", excerpt: "Acme lists security opportunities.", collectedAt: "2026-08-01T09:00:00.000Z" },
    { id: "E2", sourceId: "S2", excerpt: "Acme uses Splunk and CrowdStrike.", collectedAt: "2026-08-01T09:00:00.000Z" },
  ],
};

describe("evidence selection", () => {
  it("retains any selected public evidence regardless of age or source shape", () => {
    const claims: GroundedClaim[] = [
      { text: "Acme lists security opportunities.", evidenceIds: ["E1"], confidence: "medium" },
      { text: "Acme uses Splunk and CrowdStrike.", evidenceIds: ["E2"], confidence: "medium" },
    ];
    expect(retainEvidenceForClaims(corpus, claims)).toEqual(corpus);
  });

  it("drops evidence IDs the model invented without failing the section", () => {
    expect(retainEvidenceForClaims(corpus, [{
      text: "Invented claim",
      evidenceIds: ["E404"],
      confidence: "low",
    }])).toEqual({ sources: [], evidence: [] });
  });

  it("preserves valid selected evidence when another requested ID was invented", () => {
    expect(retainEvidenceForClaims(corpus, [{
      text: "Partly valid claim",
      evidenceIds: ["E1", "E404"],
      confidence: "low",
    }])).toEqual({ sources: [corpus.sources[0]], evidence: [corpus.evidence[0]] });
  });

  it("canonicalizes URLs without changing their destination", () => {
    expect(canonicalEvidenceUrl("https://www.Acme.example/news/?utm_source=test#top"))
      .toBe("https://acme.example/news");
  });
});
