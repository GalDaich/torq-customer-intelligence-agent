import { describe, expect, it } from "vitest";
import {
  hiringSignalSearchPlan,
  recentSignalSearchPlan,
  securitySignalSearchPlan,
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
  it("uses advanced, bounded, score-filtered searches for every evidence node", () => {
    const plans = [
      ...recentSignalSearchPlan(company),
      ...hiringSignalSearchPlan(company),
      ...securitySignalSearchPlan(company),
      ...technologySignalSearchPlan(company),
    ];

    expect(plans).toHaveLength(10);
    for (const plan of plans) {
      expect(plan.searchDepth).toBe("advanced");
      expect(plan.chunksPerSource).toBe(2);
      expect(plan.maxResults).toBe(5);
      expect(plan.minimumScore).toBeGreaterThanOrEqual(0.35);
      expect(plan.query.includes("Acme") || plan.query.includes("acme.example")).toBe(true);
    }
  });

  it("uses recency for news and suppresses noisy job aggregators", () => {
    expect(recentSignalSearchPlan(company).every((plan) => plan.timeRange === "year")).toBe(true);
    expect(recentSignalSearchPlan(company).slice(0, 2).every((plan) =>
      plan.query.startsWith("site:acme.example"),
    )).toBe(true);
    expect(recentSignalSearchPlan(company)[2]).toMatchObject({
      topic: "news",
      minimumScore: 0.35,
    });
    expect(securitySignalSearchPlan(company)[1]).toMatchObject({
      topic: "news",
      timeRange: "year",
    });
    for (const plan of hiringSignalSearchPlan(company)) {
      expect(plan.excludeDomains).toContain("linkedin.com");
      expect(plan.excludeDomains).toContain("indeed.com");
    }
  });

  it("covers Torq-relevant integration surfaces in the technology plan", () => {
    const queries = technologySignalSearchPlan(company).map((plan) => plan.query).join(" ");

    expect(queries).toContain("SIEM");
    expect(queries).toContain("EDR");
    expect(queries).toContain("IAM");
    expect(queries).toContain("ServiceNow");
    expect(queries).toContain("site:acme.example");
  });
});
