import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ResearchStreamEventSchema,
  type CompanyReport,
  type ResolvedCompany,
} from "@/lib/schemas";
import { createResearchStream, executeResearchBatch } from "./route";

afterEach(() => {
  vi.restoreAllMocks();
});

const companies = [
  {
    researchId: "77a77742-3df8-47f2-94e1-c81d8e4d27f1",
    company: {
      inputName: "Acme",
      name: "Acme",
      domain: "acme.example",
      websiteUrl: "https://acme.example",
      description: "Acme",
    },
  },
  {
    researchId: "42c83c6c-dc24-4651-a840-e7f612986dcc",
    company: {
      inputName: "Beta",
      name: "Beta",
      domain: "beta.example",
      websiteUrl: "https://beta.example",
      description: "Beta",
    },
  },
];

function reportFor(researchId: string, company: ResolvedCompany): CompanyReport {
  const claim = { text: "Grounded fact", evidenceIds: ["E1"], confidence: "medium" as const };
  return {
    researchId,
    company,
    whatTheyDo: claim,
    recentSignals: [],
    hiringSignals: [],
    securitySignals: [],
    technologySignals: [],
    likelyPainPoints: [{ painPoint: "Potential manual security work", rationale: claim }],
    talkingPoints: [
      { point: "Ask how security work is coordinated", rationale: claim },
      { point: "Explore repeatable response workflows", rationale: claim },
    ],
    confidenceAndGaps: ["Limited evidence."],
    sources: [
      {
        id: "S1",
        title: "Company",
        url: company.websiteUrl,
        publisher: company.domain,
        sourceType: "company",
        publishedAt: null,
      },
    ],
    evidence: [
      {
        id: "E1",
        sourceId: "S1",
        excerpt: "Grounded fact",
        collectedAt: "2026-08-01T09:00:00.000Z",
      },
    ],
  };
}

describe("independent research execution", () => {
  it("preserves successful reports when another company fails", async () => {
    const runner = vi.fn(async (researchId: string, company: ResolvedCompany) => {
      if (company.name === "Beta") throw new Error("secret provider detail");
      return reportFor(researchId, company);
    });

    const result = await executeResearchBatch(companies, runner);

    expect(runner).toHaveBeenCalledTimes(2);
    expect(result.reports.map((report) => report.researchId)).toEqual([companies[0].researchId]);
    expect(result.failures).toEqual([
      {
        researchId: companies[1].researchId,
        companyName: "Beta",
        message: "Research failed at a protected provider or validation boundary.",
      },
    ]);
  });

  it("streams real stage updates followed by the validated batch response", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const runner = vi.fn(
      async (
        researchId: string,
        company: ResolvedCompany,
        onProgress?: (update: {
          stage: "recentSignals";
          status: "started" | "completed";
          message: string;
          durationMs: number | null;
        }) => void | Promise<void>,
      ) => {
        await onProgress?.({
          stage: "recentSignals",
          status: "started",
          message: "Searching recent signals.",
          durationMs: null,
        });
        await onProgress?.({
          stage: "recentSignals",
          status: "completed",
          message: "Recent-signal research completed.",
          durationMs: 42,
        });
        return reportFor(researchId, company);
      },
    );

    const body = await new Response(createResearchStream([companies[0]], runner)).text();
    const events = body
      .trim()
      .split("\n")
      .map((line) => ResearchStreamEventSchema.parse(JSON.parse(line)));

    expect(events.map((event) => event.type)).toEqual([
      "progress",
      "progress",
      "complete",
    ]);
    expect(events[0]).toMatchObject({
      type: "progress",
      stage: "recentSignals",
      status: "started",
      completedSteps: 0,
      totalSteps: 7,
    });
    expect(events[1]).toMatchObject({
      type: "progress",
      status: "completed",
      completedSteps: 1,
      durationMs: 42,
    });
    expect(events[2]).toMatchObject({
      type: "complete",
      response: { failures: [] },
    });
  });
});
