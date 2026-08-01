import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CompanyReport as CompanyReportData } from "@/lib/schemas";
import { CompanyReport } from "./company-report";

describe("report citation rendering", () => {
  it("links visible claim badges to the normalized source URL", () => {
    const claim = {
      text: "Acme automates security operations.",
      evidenceIds: ["E1"],
      confidence: "high" as const,
    };
    const report: CompanyReportData = {
      researchId: "989781ac-101a-4ca0-9892-29492a1ee6ca",
      company: {
        inputName: "Acme",
        name: "Acme",
        domain: "acme.example",
        websiteUrl: "https://acme.example",
        description: "Acme",
      },
      whatTheyDo: claim,
      recentSignals: [{ category: "product", claim }],
      hiringSignals: [],
      securitySignals: [],
      likelyPainPoints: [],
      talkingPoints: [],
      confidenceAndGaps: ["Hiring evidence was not found."],
      sources: [
        {
          id: "S1",
          title: "Acme official site",
          url: "https://acme.example/about",
          publisher: "acme.example",
          sourceType: "company",
          publishedAt: null,
        },
      ],
      evidence: [
        {
          id: "E1",
          sourceId: "S1",
          excerpt: "Acme automates security operations.",
          collectedAt: "2026-08-01T09:00:00.000Z",
        },
      ],
    };

    const html = renderToStaticMarkup(<CompanyReport report={report} />);
    expect(html).toContain('href="https://acme.example/about"');
    expect(html).toContain('class="source-badge"');
    expect(html).toContain("S1");
  });
});
