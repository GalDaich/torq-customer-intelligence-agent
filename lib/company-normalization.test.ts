import { describe, expect, it } from "vitest";
import { applyCandidateNormalizations } from "./company-normalization";
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
});
