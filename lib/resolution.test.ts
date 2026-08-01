import { describe, expect, it } from "vitest";
import {
  candidatesFromCorpus,
  domainFromInput,
  normalizeCompanyNames,
  resolveCompanyName,
} from "./resolution";

const researchId = "bfe869fc-6514-425a-9a2d-5682a1ef4582";

describe("company-name normalization", () => {
  it("trims, collapses whitespace, and deduplicates case-insensitively", () => {
    expect(normalizeCompanyNames([" Acme  Security ", "acme security", "Torq"])).toEqual([
      "Acme Security",
      "Torq",
    ]);
  });

  it("enforces the one-to-five boundary", () => {
    expect(() => normalizeCompanyNames([])).toThrow("between one and five");
    expect(() => normalizeCompanyNames(["1", "2", "3", "4", "5", "6"])).toThrow(
      "between one and five",
    );
  });
});

describe("domain input", () => {
  it("accepts plain domains and URLs", () => {
    expect(domainFromInput("rapid7.com")).toBe("rapid7.com");
    expect(domainFromInput("https://www.rapid7.com/about")).toBe("rapid7.com");
    expect(domainFromInput("Rapid 7")).toBeNull();
  });
});

describe("candidate discovery", () => {
  it("groups official-site results and excludes publisher profiles", () => {
    const candidates = candidatesFromCorpus("Acme", researchId, {
      sources: [
        {
          id: "RES-S1",
          title: "Acme | Security automation",
          url: "https://www.acme.example/about",
          publisher: "acme.example",
          sourceType: "other",
          publishedAt: null,
        },
        {
          id: "RES-S2",
          title: "Acme products",
          url: "https://acme.example/products",
          publisher: "acme.example",
          sourceType: "other",
          publishedAt: null,
        },
        {
          id: "RES-S3",
          title: "Acme on LinkedIn",
          url: "https://linkedin.com/company/acme",
          publisher: "linkedin.com",
          sourceType: "linkedin",
          publishedAt: null,
        },
      ],
      evidence: [
        {
          id: "RES-E1",
          sourceId: "RES-S1",
          excerpt: "Acme builds security automation software.",
          collectedAt: "2026-08-01T09:00:00.000Z",
        },
      ],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      name: "Acme",
      domain: "acme.example",
      websiteUrl: "https://www.acme.example",
      sourceIds: ["RES-S1", "RES-S2"],
    });
  });

  it("groups subdomains under an explicitly entered domain", () => {
    const candidates = candidatesFromCorpus("rapid7.com", researchId, {
      sources: [
        {
          id: "RES-S1",
          title: "Rapid7",
          url: "https://www.rapid7.com",
          publisher: "rapid7.com",
          sourceType: "other",
          publishedAt: null,
        },
        {
          id: "RES-S2",
          title: "Rapid7 blog",
          url: "https://blog.rapid7.com/post",
          publisher: "blog.rapid7.com",
          sourceType: "other",
          publishedAt: null,
        },
      ],
      evidence: [],
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      domain: "rapid7.com",
      websiteUrl: "https://rapid7.com",
      sourceIds: ["RES-S1", "RES-S2"],
    });
  });

  it("requires selection when a partial name has multiple plausible matches", async () => {
    const search = async () => ({
      sources: [
        {
          id: "RES-S1",
          title: "Rapid7 | Cybersecurity",
          url: "https://rapid7.com",
          publisher: "rapid7.com",
          sourceType: "other" as const,
          publishedAt: null,
        },
        {
          id: "RES-S2",
          title: "RapidAPI | API Hub",
          url: "https://rapidapi.com",
          publisher: "rapidapi.com",
          sourceType: "other" as const,
          publishedAt: null,
        },
      ],
      evidence: [],
    });

    const resolution = await resolveCompanyName("rapid", search);
    expect(resolution.status).toBe("ambiguous");
    expect(resolution.candidates.map((candidate) => candidate.domain)).toEqual([
      "rapid7.com",
      "rapidapi.com",
    ]);
  });

  it("automatically resolves a single plausible name among unrelated results", async () => {
    const search = async () => ({
      sources: [
        {
          id: "RES-S1",
          title: "Rapid7 | Cybersecurity",
          url: "https://rapid7.com",
          publisher: "rapid7.com",
          sourceType: "other" as const,
          publishedAt: null,
        },
        {
          id: "RES-S2",
          title: "Security Weekly",
          url: "https://securityweekly.example/rapid7",
          publisher: "securityweekly.example",
          sourceType: "other" as const,
          publishedAt: null,
        },
      ],
      evidence: [],
    });

    const resolution = await resolveCompanyName("Rapid7", search);
    expect(resolution.status).toBe("unique");
    expect(resolution.candidates).toHaveLength(1);
    expect(resolution.candidates[0].domain).toBe("rapid7.com");
  });
});
