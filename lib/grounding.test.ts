import { describe, expect, it } from "vitest";
import { GroundingValidationError, validateGroundedReport } from "./grounding";
import { CompanyReportSchema, SourceSchema } from "./schemas";

const researchId = "7d9c8f2e-4222-4dbd-a5e7-e38f7046d87e";

function validReport() {
  const claim = {
    text: "Acme builds security automation software.",
    evidenceIds: ["E1"],
    confidence: "high" as const,
  };

  return {
    researchId,
    company: {
      inputName: "Acme",
      name: "Acme Security",
      domain: "acme.example",
      websiteUrl: "https://acme.example",
      description: "Security software company",
    },
    whatTheyDo: claim,
    recentSignals: [],
    hiringSignals: [],
    securitySignals: [],
    likelyPainPoints: [{ painPoint: "Manual work", rationale: claim }],
    talkingPoints: [{ point: "Discuss automation", rationale: claim }],
    confidenceAndGaps: ["No recent hiring evidence was found."],
    sources: [
      {
        id: "S1",
        title: "Acme",
        url: "https://acme.example",
        publisher: "Acme Security",
        sourceType: "company" as const,
        publishedAt: null,
      },
    ],
    evidence: [
      {
        id: "E1",
        sourceId: "S1",
        excerpt: "Acme builds security automation software.",
        collectedAt: "2026-08-01T09:00:00.000Z",
      },
    ],
  };
}

describe("strict schemas", () => {
  it("accepts the complete report contract", () => {
    expect(CompanyReportSchema.parse(validReport()).researchId).toBe(researchId);
  });

  it("rejects uncontracted source fields", () => {
    expect(() =>
      SourceSchema.parse({
        ...validReport().sources[0],
        rawProviderPayload: { secret: "must not cross the boundary" },
      }),
    ).toThrow();
  });
});

describe("grounding validation", () => {
  it("accepts a complete claim to evidence to source chain", () => {
    expect(validateGroundedReport(validReport())).toEqual(validReport());
  });

  it("rejects evidence pointing to an unknown source", () => {
    const report = validReport();
    report.evidence[0].sourceId = "S404";

    expect(() => validateGroundedReport(report)).toThrow(GroundingValidationError);
  });

  it("rejects claims pointing to unknown evidence", () => {
    const report = validReport();
    report.whatTheyDo.evidenceIds = ["E404"];

    expect(() => validateGroundedReport(report)).toThrow(
      "Claim references unknown evidence E404.",
    );
  });

  it("rejects duplicate lineage IDs", () => {
    const report = validReport();
    report.sources.push({ ...report.sources[0] });

    expect(() => validateGroundedReport(report)).toThrow("Source IDs must be unique.");
  });
});
