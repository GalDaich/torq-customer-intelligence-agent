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
  it("uses a 14-credit evidence plan with depth matched to query complexity", () => {
    const plans = [
      ...recentSignalSearchPlan(company),
      ...hiringSignalSearchPlan(company),
      ...securitySignalSearchPlan(company),
      ...technologySignalSearchPlan(company),
    ];

    expect(plans).toHaveLength(9);
    expect(plans.filter((plan) => plan.searchDepth === "advanced")).toHaveLength(5);
    expect(plans.filter((plan) => plan.searchDepth === "basic")).toHaveLength(4);
    for (const plan of plans) {
      expect(plan.maxResults).toBe(5);
      expect(plan.minimumScore).toBeGreaterThanOrEqual(0.35);
      expect(plan.query.includes("Acme") || plan.query.includes("acme.example")).toBe(true);
      if (plan.searchDepth === "advanced") expect(plan.chunksPerSource).toBe(2);
      else expect(plan.chunksPerSource).toBeUndefined();
    }

    const researchCredits = plans.reduce(
      (total, plan) => total + (plan.searchDepth === "advanced" ? 2 : 1),
      0,
    );
    expect(researchCredits).toBe(14);
  });

  it("uses recency for news and suppresses noisy job aggregators", () => {
    expect(recentSignalSearchPlan(company).every((plan) => plan.timeRange === "year")).toBe(true);
    expect(recentSignalSearchPlan(company)[0]).toMatchObject({
      searchDepth: "basic",
      timeRange: "year",
    });
    expect(recentSignalSearchPlan(company)[0].query).toContain("site:acme.example");
    expect(recentSignalSearchPlan(company)[1]).toMatchObject({
      searchDepth: "advanced",
      topic: "news",
      minimumScore: 0.35,
    });
    expect(securitySignalSearchPlan(company)[1]).toMatchObject({
      searchDepth: "basic",
      topic: "news",
      timeRange: "year",
    });
    for (const plan of hiringSignalSearchPlan(company)) {
      expect(plan.excludeDomains).toContain("linkedin.com");
      expect(plan.excludeDomains).toContain("indeed.com");
    }
  });

  it("covers Torq-relevant integration surfaces in the technology plan", () => {
    const plan = technologySignalSearchPlan(company);
    const queries = plan.map((item) => item.query).join(" ");

    expect(plan.map((item) => item.searchDepth)).toEqual(["advanced", "basic", "basic"]);
    expect(queries).toContain("SIEM");
    expect(queries).toContain("EDR");
    expect(queries).toContain("IAM");
    expect(queries).toContain("ServiceNow");
    expect(queries).toContain("site:acme.example");
  });
});
