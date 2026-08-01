import { describe, expect, it } from "vitest";
import {
  hiringSignalSearchPlan,
  recentSignalSearchPlan,
  securitySignalSearchPlan,
  selectRecentFirstPartyUrls,
  technologySignalSearchPlan,
} from "./research-plans";
import type { ResolvedCompany } from "./schemas";

const company: ResolvedCompany = {
  inputName: "Acme",
  name: "Acme",
  domain: "acme.example",
  websiteUrl: "https://acme.example",
  description: "Acme builds software.",
};

describe("node-specific Tavily plans", () => {
  it("keeps research bounded without date, score, or domain-exclusion gates", () => {
    const plans = [
      ...recentSignalSearchPlan(company),
      ...hiringSignalSearchPlan(company),
      ...securitySignalSearchPlan(company),
      ...technologySignalSearchPlan(company),
    ];

    expect(plans).toHaveLength(10);
    expect(plans.filter((plan) => plan.searchDepth === "advanced")).toHaveLength(5);
    expect(plans.filter((plan) => plan.searchDepth === "basic")).toHaveLength(5);
    for (const plan of plans) {
      expect(plan.maxResults).toBe(5);
      expect(plan.query.includes("Acme") || plan.query.includes("acme.example")).toBe(true);
      expect(plan).not.toHaveProperty("researchWindow");
      expect(plan).not.toHaveProperty("timeRange");
      expect(plan).not.toHaveProperty("minimumScore");
      expect(plan).not.toHaveProperty("excludeDomains");
      if (plan.searchDepth === "advanced") expect(plan.chunksPerSource).toBe(2);
    }
  });

  it("covers company developments and Torq-relevant integration surfaces", () => {
    const recentQueries = recentSignalSearchPlan(company).map((item) => item.query).join(" ");
    const technologyQueries = technologySignalSearchPlan(company).map((item) => item.query).join(" ");

    expect(recentQueries).toContain("press release");
    expect(recentQueries).toContain("customer story");
    expect(technologyQueries).toContain("SIEM");
    expect(technologyQueries).toContain("EDR");
    expect(technologyQueries).toContain("IAM");
    expect(technologyQueries).toContain("ServiceNow");
    expect(technologyQueries).toContain("site:acme.example");
  });

  it("maps item-specific company posts from the confirmed domain", () => {
    expect(
      selectRecentFirstPartyUrls(
        [
          { url: "https://acme.example/blog", title: "Acme blog", description: "Company articles" },
          { url: "https://acme.example/blog/security-launch", title: "Security launch", description: "Product announcement" },
          { url: "https://blog.acme.example/company-update", title: "Company update", description: "Leadership announcement" },
          { url: "https://publisher.example/news/acme", title: "External story", description: "Acme news" },
        ],
        company,
      ),
    ).toEqual([
      "https://acme.example/blog/security-launch",
      "https://blog.acme.example/company-update",
    ]);
  });
});
