import { describe, expect, it } from "vitest";
import {
  applyCandidateNormalizations,
  companyNormalizationTraceConfig,
} from "./company-normalization";
import type { CompanyCandidate } from "./schemas";

const candidate: CompanyCandidate = {
  id: "research:C1",
  name: "Join monday.com",
  domain: "monday.com",
  websiteUrl: "https://monday.com",
  description: "Build and scale your workflows on monday.com.",
  sourceIds: ["RES-S1"],
};

describe("company identity normalization", () => {
  it("changes only model-owned identity text", () => {
    const [normalized] = applyCandidateNormalizations([candidate], {
      candidates: [
        {
          candidateId: candidate.id,
          companyName: "monday.com",
          description: "monday.com provides a work management platform.",
        },
      ],
    });

    expect(normalized).toEqual({
      ...candidate,
      name: "monday.com",
      description: "monday.com provides a work management platform.",
    });
  });

  it("rejects missing, duplicate, or invented candidate references", () => {
    expect(() =>
      applyCandidateNormalizations([candidate], {
        candidates: [
          {
            candidateId: "invented:C1",
            companyName: "monday.com",
            description: "A normalized description.",
          },
        ],
      }),
    ).toThrow("invalid candidate references");
  });

  it("makes the pre-graph LLM call searchable in LangSmith", () => {
    const config = companyNormalizationTraceConfig(
      "monday.com",
      { researchId: "7d9c8f2e-4222-4dbd-a5e7-e38f7046d87e" },
      1,
    );

    expect(config.runName).toBe("normalize_company_identity");
    expect(config.tags).toContain("identity-normalization");
    expect(config.tags).toContain("research:7d9c8f2e-4222-4dbd-a5e7-e38f7046d87e");
    expect(config.metadata).toMatchObject({
      researchId: "7d9c8f2e-4222-4dbd-a5e7-e38f7046d87e",
      companyName: "monday.com",
      stage: "company_identity_normalization",
      candidateCount: 1,
    });
  });
});
