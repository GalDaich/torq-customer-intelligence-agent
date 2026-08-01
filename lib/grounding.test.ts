import { describe, expect, it } from "vitest";
import {
  GroundingValidationError,
  retainCitedLineage,
  restoreGroundedReport,
  validateGroundedReport,
} from "./grounding";
import { CompanyReportSchema, SourceSchema, type CompanyReport } from "./schemas";

const researchId = "7d9c8f2e-4222-4dbd-a5e7-e38f7046d87e";

function validReport(): CompanyReport {
  const claim = {
    text: "Acme builds security automation software.",
    evidenceIds: ["E1"],
    confidence: "high" as const,
  };
  return {
    researchId,
    company: { inputName: "Acme", name: "Acme Security", domain: "acme.example", websiteUrl: "https://acme.example", description: "Security software company" },
    whatTheyDo: claim,
    recentSignals: [],
    hiringSignals: [],
    securitySignals: [],
    technologySignals: [],
    likelyPainPoints: [{ painPoint: "Manual work", rationale: claim }],
    talkingPoints: [
      { point: "Discuss automation", rationale: claim },
      { point: "Ask about response workflows", rationale: claim },
    ],
    confidenceAndGaps: ["Dates should be verified."],
    sources: [{ id: "S1", title: "Acme", url: "https://acme.example", publisher: "Acme", sourceType: "company", publishedAt: null }],
    evidence: [{ id: "E1", sourceId: "S1", excerpt: "Acme builds security automation software.", collectedAt: "2026-08-01T09:00:00.000Z" }],
  };
}

describe("strict schemas", () => {
  it("accepts the complete report contract", () => {
    expect(CompanyReportSchema.parse(validReport()).researchId).toBe(researchId);
  });

  it("rejects uncontracted source fields", () => {
    expect(() => SourceSchema.parse({
      ...validReport().sources[0],
      rawProviderPayload: { secret: "must not cross the boundary" },
    })).toThrow();
  });
});

describe("demo grounding validation", () => {
  it("accepts a complete claim to evidence to source chain", () => {
    expect(validateGroundedReport(validReport())).toEqual(validReport());
  });

  it("accepts old, undated, generic, and multi-evidence public sources", () => {
    const report = validReport();
    report.sources.push({ id: "S2", title: "Careers", url: "https://jobs.example/acme", publisher: "jobs.example", sourceType: "hiring", publishedAt: "2020-01-01" });
    report.evidence.push({ id: "E2", sourceId: "S2", excerpt: "Acme lists a Security Engineer opportunity.", collectedAt: "2026-08-01T09:00:00.000Z" });
    report.hiringSignals = [{
      roleTitle: "Security Engineer",
      team: null,
      location: null,
      postedAt: null,
      claim: { text: "Acme lists a Security Engineer opportunity.", evidenceIds: ["E1", "E2"], confidence: "medium" },
    }];
    report.technologySignals = [{
      technology: "Splunk and CrowdStrike",
      category: "siem",
      claim: { text: "The evidence mentions Splunk and CrowdStrike.", evidenceIds: ["E2"], confidence: "low" },
      torqRelevance: { text: "These tools may be useful conversation context.", evidenceIds: ["E1", "E2"], confidence: "low" },
    }];

    expect(validateGroundedReport(report)).toEqual(report);
    expect(restoreGroundedReport(report).hiringSignals).toHaveLength(1);
    expect(restoreGroundedReport(report).technologySignals).toHaveLength(1);
  });

  it("rejects evidence pointing to an unknown source", () => {
    const report = validReport();
    report.evidence[0].sourceId = "S404";
    expect(() => validateGroundedReport(report)).toThrow(GroundingValidationError);
  });

  it("rejects claims pointing to unknown evidence", () => {
    const report = validReport();
    report.whatTheyDo!.evidenceIds = ["E404"];
    expect(() => validateGroundedReport(report)).toThrow("Claim references unknown evidence E404.");
  });

  it("rejects duplicate lineage IDs", () => {
    const report = validReport();
    report.sources.push({ ...report.sources[0] });
    expect(() => validateGroundedReport(report)).toThrow("Source IDs must be unique.");
  });

  it("removes uncited corpus records from the user-facing report", () => {
    const report = validReport();
    report.sources.push({ id: "S2", title: "Careers", url: "https://acme.example/careers", publisher: "acme.example", sourceType: "hiring", publishedAt: null });
    report.evidence.push({ id: "E2", sourceId: "S2", excerpt: "Explore open positions.", collectedAt: "2026-08-01T09:00:00.000Z" });
    expect(retainCitedLineage(report)).toEqual(validReport());
  });

  it("omits only findings with invented evidence and keeps the rest", () => {
    const report = validReport();
    report.hiringSignals = [{
      roleTitle: "Invented role",
      team: null,
      location: null,
      postedAt: null,
      claim: { text: "Invented role", evidenceIds: ["E404"], confidence: "low" },
    }];
    const restored = restoreGroundedReport(report);
    expect(restored.whatTheyDo).toEqual(report.whatTheyDo);
    expect(restored.hiringSignals).toEqual([]);
    expect(restored.confidenceAndGaps).toContain(
      "Some findings were omitted because their evidence references were unavailable.",
    );
  });
});
