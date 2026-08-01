import { describe, expect, it } from "vitest";
import {
  companyFromManualWebsite,
  everyResolutionDecided,
  selectedCompaniesFromDecisions,
  type ResolutionDecision,
} from "./company-selection";
import type { CompanyResolution } from "./schemas";

const researchId = "bfe869fc-6514-425a-9a2d-5682a1ef4582";
const resolution: CompanyResolution = {
  researchId,
  inputName: "Google",
  status: "unique",
  candidates: [{
    id: `${researchId}:C1`,
    name: "Google",
    domain: "google.com",
    websiteUrl: "https://google.com",
    description: "Google provides online products.",
    sourceIds: ["RES-S1"],
  }],
  sources: [],
  gaps: [],
};

describe("company-resolution decisions", () => {
  it("never selects or starts a unique match without an explicit decision", () => {
    expect(selectedCompaniesFromDecisions([resolution], {})).toEqual([]);
    expect(everyResolutionDecided([resolution], {})).toBe(false);
  });

  it("turns a confirmed candidate into a research input", () => {
    const decisions: Record<string, ResolutionDecision> = {
      [researchId]: { kind: "candidate", candidateId: `${researchId}:C1` },
    };

    expect(selectedCompaniesFromDecisions([resolution], decisions)).toEqual([{
      researchId,
      company: {
        inputName: "Google",
        name: "Google",
        domain: "google.com",
        websiteUrl: "https://google.com",
        description: "Google provides online products.",
      },
    }]);
    expect(everyResolutionDecided([resolution], decisions)).toBe(true);
  });

  it("accepts a manually confirmed public website and canonicalizes it to its origin", () => {
    expect(companyFromManualWebsite("Acme", "www.acme.example/about")).toEqual({
      inputName: "Acme",
      name: "Acme",
      domain: "acme.example",
      websiteUrl: "https://www.acme.example",
      description: "Official website manually confirmed by the user.",
    });
    expect(() => companyFromManualWebsite("Acme", "localhost:3000")).toThrow(
      "valid public website",
    );
  });

  it("counts a discarded company as decided without sending it to research", () => {
    const decisions: Record<string, ResolutionDecision> = {
      [researchId]: { kind: "discarded" },
    };
    expect(everyResolutionDecided([resolution], decisions)).toBe(true);
    expect(selectedCompaniesFromDecisions([resolution], decisions)).toEqual([]);
  });
});
