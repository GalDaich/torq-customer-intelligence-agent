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
    technologySignals: [],
    likelyPainPoints: [{ painPoint: "Manual work", rationale: claim }],
    talkingPoints: [
      { point: "Discuss automation", rationale: claim },
      { point: "Ask about response workflows", rationale: claim },
    ],
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

  it("allows an honest partial report while retaining upper bounds", () => {
    const report = validReport();
    report.likelyPainPoints = [];
    report.talkingPoints = [];
    report.whatTheyDo = null;
    expect(CompanyReportSchema.parse(report)).toMatchObject({
      whatTheyDo: null,
      likelyPainPoints: [],
      talkingPoints: [],
    });

    const tooMany = validReport();
    tooMany.talkingPoints.push(
      { point: "Third", rationale: tooMany.whatTheyDo! },
      { point: "Fourth", rationale: tooMany.whatTheyDo! },
    );
    expect(() => CompanyReportSchema.parse(tooMany)).toThrow();
  });
});

describe("grounding validation", () => {
  it("accepts a complete claim to evidence to source chain", () => {
    expect(validateGroundedReport(validReport())).toEqual(validReport());
  });

  it("enforces the runtime evidence window at the final report boundary", () => {
    const researchWindow = {
      today: "2026-08-01",
      oneYearAgo: "2025-08-01",
    };
    const current = validReport();
    current.sources[0].publishedAt = "2026-01-10";
    expect(validateGroundedReport(current, researchWindow)).toEqual(current);

    const old = validReport();
    old.sources[0].publishedAt = "2021-01-10";
    expect(() => validateGroundedReport(old, researchWindow)).toThrow(
      "Every source must be dated within 2025-08-01 through 2026-08-01.",
    );
  });

  it("restores a report by omitting old or undated evidence", () => {
    const restored = restoreGroundedReport(validReport(), {
      today: "2026-08-01",
      oneYearAgo: "2025-08-01",
    });

    expect(restored.whatTheyDo).toBeNull();
    expect(restored.sources).toEqual([]);
    expect(restored.evidence).toEqual([]);
    expect(restored.confidenceAndGaps).toContain(
      "Sources without a publication date from 2025-08-01 through 2026-08-01 were omitted.",
    );
  });

  it("accepts an evidence-free partial report with an explicit gap", () => {
    const report = validReport();
    report.whatTheyDo = null;
    report.recentSignals = [];
    report.hiringSignals = [];
    report.securitySignals = [];
    report.technologySignals = [];
    report.likelyPainPoints = [];
    report.talkingPoints = [];
    report.confidenceAndGaps = ["Collected findings could not be safely retained."];
    report.sources = [];
    report.evidence = [];

    expect(validateGroundedReport(report)).toEqual(report);
  });

  it("rejects evidence pointing to an unknown source", () => {
    const report = validReport();
    report.evidence[0].sourceId = "S404";

    expect(() => validateGroundedReport(report)).toThrow(GroundingValidationError);
  });

  it("rejects claims pointing to unknown evidence", () => {
    const report = validReport();
    report.whatTheyDo!.evidenceIds = ["E404"];

    expect(() => validateGroundedReport(report)).toThrow(
      "Claim references unknown evidence E404.",
    );
  });

  it("rejects duplicate lineage IDs", () => {
    const report = validReport();
    report.sources.push({ ...report.sources[0] });

    expect(() => validateGroundedReport(report)).toThrow("Source IDs must be unique.");
  });

  it("removes uncited corpus records before final validation", () => {
    const report = validReport();
    report.sources.push({
      id: "S2",
      title: "Generic careers page",
      url: "https://acme.example/careers",
      publisher: "acme.example",
      sourceType: "hiring",
      publishedAt: null,
    });
    report.evidence.push({
      id: "E2",
      sourceId: "S2",
      excerpt: "Explore open positions and join our team.",
      collectedAt: "2026-08-01T09:00:00.000Z",
    });

    expect(retainCitedLineage(report)).toEqual(validReport());
    expect(() => validateGroundedReport(report)).toThrow("must not retain uncited evidence");
  });

  it("rejects a generic careers page as hiring evidence", () => {
    const report = validReport();
    report.sources.push({
      id: "S2",
      title: "Careers at Acme",
      url: "https://acme.example/careers",
      publisher: "acme.example",
      sourceType: "hiring",
      publishedAt: null,
    });
    report.evidence.push({
      id: "E2",
      sourceId: "S2",
      excerpt: "Acme lists opportunities across its security organization.",
      collectedAt: "2026-08-01T09:00:00.000Z",
    });
    report.hiringSignals = [{
      roleTitle: "Security Engineer",
      team: null,
      location: null,
      postedAt: null,
      claim: { text: "Acme is hiring a Security Engineer.", evidenceIds: ["E2"], confidence: "low" },
    }];

    expect(() => validateGroundedReport(report)).toThrow("specific job or article");
  });

  it("rejects the same position repeated from multiple sources", () => {
    const report = validReport();
    report.sources.push(
      {
        id: "S2",
        title: "Security Engineer at Acme",
        url: "https://linkedin.com/jobs/view/security-engineer-123",
        publisher: "linkedin.com",
        sourceType: "hiring",
        publishedAt: null,
      },
      {
        id: "S3",
        title: "Security Engineer - Acme",
        url: "https://indeed.com/viewjob?jk=456",
        publisher: "indeed.com",
        sourceType: "hiring",
        publishedAt: null,
      },
    );
    report.evidence.push(
      {
        id: "E2",
        sourceId: "S2",
        excerpt: "Acme is hiring a Security Engineer in Tel Aviv.",
        collectedAt: "2026-08-01T09:00:00.000Z",
      },
      {
        id: "E3",
        sourceId: "S3",
        excerpt: "The Security Engineer role at Acme is based in Tel Aviv and supports cloud security.",
        collectedAt: "2026-08-01T09:00:00.000Z",
      },
    );
    report.hiringSignals = [
      {
        roleTitle: "Security Engineer",
        team: null,
        location: "Tel Aviv",
        postedAt: null,
        claim: { text: "Acme is hiring a Security Engineer.", evidenceIds: ["E2"], confidence: "high" },
      },
      {
        roleTitle: "Security Engineer",
        team: "Cloud Security",
        location: "Tel Aviv",
        postedAt: null,
        claim: { text: "Acme lists a Security Engineer opening.", evidenceIds: ["E3"], confidence: "high" },
      },
    ];

    expect(() => validateGroundedReport(report)).toThrow("appears more than once");
  });

  it("requires one strongest evidence record for each hiring role", () => {
    const report = validReport();
    report.sources.push(
      {
        id: "S2",
        title: "Security Engineer at Acme",
        url: "https://linkedin.com/jobs/view/security-engineer-123",
        publisher: "linkedin.com",
        sourceType: "hiring",
        publishedAt: null,
      },
      {
        id: "S3",
        title: "Security Engineer - Acme",
        url: "https://indeed.com/viewjob?jk=456",
        publisher: "indeed.com",
        sourceType: "hiring",
        publishedAt: null,
      },
    );
    report.evidence.push(
      {
        id: "E2",
        sourceId: "S2",
        excerpt: "Acme is hiring a Security Engineer in Tel Aviv.",
        collectedAt: "2026-08-01T09:00:00.000Z",
      },
      {
        id: "E3",
        sourceId: "S3",
        excerpt: "An Acme Security Engineer role is open in Tel Aviv.",
        collectedAt: "2026-08-01T09:00:00.000Z",
      },
    );
    report.hiringSignals = [{
      roleTitle: "Security Engineer",
      team: null,
      location: "Tel Aviv",
      postedAt: null,
      claim: {
        text: "Acme is hiring a Security Engineer.",
        evidenceIds: ["E2", "E3"],
        confidence: "high",
      },
    }];

    expect(() => validateGroundedReport(report)).toThrow("exactly one strongest evidence");
  });

  it("accepts one specific shared evidence record for a technology signal", () => {
    const report = validReport();
    report.sources.push({
      id: "S2",
      title: "Acme security architecture",
      url: "https://acme.example/engineering/security-architecture",
      publisher: "acme.example",
      sourceType: "technology",
      publishedAt: null,
    });
    report.evidence.push({
      id: "E2",
      sourceId: "S2",
      excerpt: "Acme uses Splunk for security monitoring.",
      collectedAt: "2026-08-01T09:00:00.000Z",
    });
    report.technologySignals = [{
      technology: "Splunk",
      category: "siem",
      claim: {
        text: "Acme uses Splunk for security monitoring.",
        evidenceIds: ["E2"],
        confidence: "high",
      },
      torqRelevance: {
        text: "Splunk may be an alert-ingestion and response orchestration surface.",
        evidenceIds: ["E2"],
        confidence: "medium",
      },
    }];

    expect(validateGroundedReport(report).technologySignals).toHaveLength(1);
  });

  it("rejects generic or duplicate technology signals", () => {
    const report = validReport();
    report.sources.push({
      id: "S2",
      title: "Engineering",
      url: "https://acme.example/engineering",
      publisher: "acme.example",
      sourceType: "technology",
      publishedAt: null,
    });
    report.evidence.push({
      id: "E2",
      sourceId: "S2",
      excerpt: "Acme engineers use Splunk.",
      collectedAt: "2026-08-01T09:00:00.000Z",
    });
    const signal = {
      technology: "Splunk",
      category: "siem" as const,
      claim: {
        text: "Acme uses Splunk.",
        evidenceIds: ["E2"],
        confidence: "medium" as const,
      },
      torqRelevance: {
        text: "Splunk may be an orchestration surface.",
        evidenceIds: ["E2"],
        confidence: "low" as const,
      },
    };
    report.technologySignals = [signal];

    expect(() => validateGroundedReport(report)).toThrow("specific technical source");

    report.sources[1] = {
      ...report.sources[1],
      title: "Acme security architecture",
      url: "https://acme.example/engineering/security-architecture",
    };
    report.technologySignals = [signal, { ...signal, technology: "splunk" }];
    expect(() => validateGroundedReport(report)).toThrow("appears more than once");
  });

  it("restores the Rapyd failure mode by omitting grouped technologies", () => {
    const report = validReport();
    report.sources.push({
      id: "S2",
      title: "DevOps Engineer - Acme",
      url: "https://acme.example/careers/positions/devops-engineer",
      publisher: "acme.example",
      sourceType: "technology",
      publishedAt: null,
    });
    report.evidence.push({
      id: "E2",
      sourceId: "S2",
      excerpt: "The role uses Terraform, Ansible, and CloudFormation.",
      collectedAt: "2026-08-01T09:00:00.000Z",
    });
    report.technologySignals = [{
      technology: "Terraform, Ansible, and CloudFormation",
      category: "devops",
      claim: {
        text: "Acme lists Terraform, Ansible, and CloudFormation.",
        evidenceIds: ["E2"],
        confidence: "high",
      },
      torqRelevance: {
        text: "The tools may identify an infrastructure automation surface.",
        evidenceIds: ["E2"],
        confidence: "medium",
      },
    }];

    const restored = restoreGroundedReport(report);

    expect(restored.technologySignals).toEqual([]);
    expect(restored.evidence.map((evidence) => evidence.id)).toEqual(["E1"]);
    expect(restored.confidenceAndGaps).toContain(
      "Some technology signals were omitted because they grouped multiple tools, were duplicate, generic, or lacked one specific supporting source.",
    );
  });
});
