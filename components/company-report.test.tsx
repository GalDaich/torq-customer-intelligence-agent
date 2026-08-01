import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CompanyReport as CompanyReportData } from "@/lib/schemas";
import { CompanyReport, GroundedClaimText } from "./company-report";
import { ReportLaunchCard } from "./report-launchpad";

const report: CompanyReportData = {
  researchId: "989781ac-101a-4ca0-9892-29492a1ee6ca",
  company: {
    inputName: "Acme",
    name: "Acme",
    domain: "acme.example",
    websiteUrl: "https://acme.example",
    description: "Acme",
  },
  whatTheyDo: {
    text: "Acme automates security operations.",
    evidenceIds: ["E1"],
    confidence: "high",
  },
  recentSignals: [
    {
      category: "product",
      claim: {
        text: "Acme automates security operations.",
        evidenceIds: ["E1"],
        confidence: "high",
      },
    },
  ],
  hiringSignals: [],
  securitySignals: [],
  technologySignals: [],
  likelyPainPoints: [{
    painPoint: "Potential manual security work",
    rationale: {
      text: "Acme automates security operations.",
      evidenceIds: ["E1"],
      confidence: "low",
    },
  }],
  talkingPoints: [
    {
      point: "Ask how Acme coordinates security automation.",
      rationale: {
        text: "Acme automates security operations.",
        evidenceIds: ["E1"],
        confidence: "medium",
      },
    },
    {
      point: "Explore where repeatable workflows matter.",
      rationale: {
        text: "Acme automates security operations.",
        evidenceIds: ["E1"],
        confidence: "medium",
      },
    },
  ],
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

describe("report citation rendering", () => {
  it("links visible claim badges to the normalized source URL", () => {
    const html = renderToStaticMarkup(
      <GroundedClaimText claim={report.whatTheyDo} report={report} />,
    );
    expect(html).toContain('href="https://acme.example/about"');
    expect(html).toContain('class="source-badge"');
    expect(html).toContain("S1");
  });
});

describe("report accordion", () => {
  it("starts with every category collapsed", () => {
    const html = renderToStaticMarkup(<CompanyReport report={report} />);

    expect((html.match(/aria-expanded="false"/g) ?? [])).toHaveLength(9);
    expect(html).toContain("What they do");
    expect(html).toContain("Technology &amp; integration signals");
    expect(html).toContain("Sources (1)");
    expect(html).not.toContain("Acme automates security operations.");
  });
});

describe("report launch card", () => {
  it("shows only the company name and website as visible card content", () => {
    const html = renderToStaticMarkup(<ReportLaunchCard report={report} />);

    expect(html).toContain(">Acme</strong>");
    expect(html).toContain(">https://acme.example</span>");
    expect(html).toContain('aria-label="Open Acme report in a new tab"');
    expect(html).not.toContain("Customer intelligence report");
    expect(html).not.toContain(report.researchId);
  });
});
