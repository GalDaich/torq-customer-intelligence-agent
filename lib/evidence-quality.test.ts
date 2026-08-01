import { describe, expect, it } from "vitest";
import type { GroundedClaim, HiringSignal, TechnologySignal } from "./schemas";
import {
  retainEvidenceForClaims,
  retainStrongHiringEvidence,
  retainStrongTechnologyEvidence,
  type EvidenceCorpus,
} from "./evidence-quality";

const collectedAt = "2026-08-01T09:00:00.000Z";

function hiringCorpus(): EvidenceCorpus {
  return {
    sources: [
      {
        id: "S1",
        title: "Security Engineer at Acme",
        url: "https://acme.example/jobs/security-engineer-123",
        publisher: "acme.example",
        sourceType: "hiring",
        publishedAt: null,
      },
      {
        id: "S2",
        title: "Security Engineer - Acme",
        url: "https://indeed.com/viewjob?jk=456",
        publisher: "indeed.com",
        sourceType: "hiring",
        publishedAt: null,
      },
    ],
    evidence: [
      {
        id: "E1",
        sourceId: "S1",
        excerpt: "Acme is hiring a Security Engineer in Tel Aviv.",
        collectedAt,
      },
      {
        id: "E2",
        sourceId: "S2",
        excerpt: "The Acme Security Engineer role is based in Tel Aviv.",
        collectedAt,
      },
    ],
  };
}

function hiringSignal(evidenceId: string): HiringSignal {
  return {
    roleTitle: "Security Engineer",
    team: null,
    location: "Tel Aviv",
    postedAt: null,
    claim: {
      text: "Acme is hiring a Security Engineer in Tel Aviv.",
      evidenceIds: [evidenceId],
      confidence: "high",
    },
  };
}

describe("node evidence selection", () => {
  it("passes only model-selected lineage to synthesis", () => {
    const selected = retainStrongHiringEvidence(hiringCorpus(), [hiringSignal("E1")]);

    expect(selected.sources.map((source) => source.id)).toEqual(["S1"]);
    expect(selected.evidence.map((evidence) => evidence.id)).toEqual(["E1"]);
  });

  it("rejects duplicate versions of the same position at the node boundary", () => {
    expect(() =>
      retainStrongHiringEvidence(hiringCorpus(), [
        hiringSignal("E1"),
        { ...hiringSignal("E2"), team: "Cloud Security" },
      ]),
    ).toThrow("selected more than once");
  });

  it("rejects invented evidence IDs instead of forwarding them", () => {
    const claim: GroundedClaim = {
      text: "Invented claim",
      evidenceIds: ["E404"],
      confidence: "low",
    };

    expect(() => retainEvidenceForClaims(hiringCorpus(), [claim])).toThrow(
      "unknown evidence E404",
    );
  });
});

describe("technology evidence selection", () => {
  const corpus: EvidenceCorpus = {
    sources: [{
      id: "TEC-S1",
      title: "Security Engineer",
      url: "https://acme.example/jobs/security-engineer-123",
      publisher: "acme.example",
      sourceType: "technology",
      publishedAt: null,
    }],
    evidence: [{
      id: "TEC-E1",
      sourceId: "TEC-S1",
      excerpt: "The role uses Splunk for security monitoring.",
      collectedAt,
    }],
  };
  const signal: TechnologySignal = {
    technology: "Splunk",
    category: "siem",
    claim: {
      text: "Acme uses Splunk for security monitoring.",
      evidenceIds: ["TEC-E1"],
      confidence: "high",
    },
    torqRelevance: {
      text: "Splunk is a potential alert-ingestion and response orchestration surface.",
      evidenceIds: ["TEC-E1"],
      confidence: "medium",
    },
  };

  it("retains one shared strong evidence record per named technology", () => {
    expect(retainStrongTechnologyEvidence(corpus, [signal])).toEqual(corpus);
  });

  it("rejects duplicate technologies and mismatched relevance evidence", () => {
    expect(() => retainStrongTechnologyEvidence(corpus, [signal, { ...signal, technology: "splunk" }]))
      .toThrow("selected more than once");
    expect(() => retainStrongTechnologyEvidence(corpus, [{
      ...signal,
      torqRelevance: { ...signal.torqRelevance, evidenceIds: ["TEC-E2"] },
    }])).toThrow("one shared evidence record");
    expect(() => retainStrongTechnologyEvidence(corpus, [{
      ...signal,
      technology: "Splunk and CrowdStrike",
    }])).toThrow("exactly one technology");
  });
});
