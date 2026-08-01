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
const researchWindow = {
  today: "2026-08-01",
  oneYearAgo: "2025-08-01",
};

describe("node-specific Tavily plans", () => {
  it("uses a 15-credit evidence plan with depth matched to query complexity", () => {
    const plans = [
      ...recentSignalSearchPlan(company, researchWindow),
      ...hiringSignalSearchPlan(company, researchWindow),
      ...securitySignalSearchPlan(company, researchWindow),
      ...technologySignalSearchPlan(company, researchWindow),
    ];

    expect(plans).toHaveLength(10);
    expect(plans.filter((plan) => plan.searchDepth === "advanced")).toHaveLength(5);
    expect(plans.filter((plan) => plan.searchDepth === "basic")).toHaveLength(5);
    for (const plan of plans) {
      expect(plan.maxResults).toBe(5);
      expect(plan.minimumScore).toBeGreaterThanOrEqual(0.25);
      expect(plan.query.includes("Acme") || plan.query.includes("acme.example")).toBe(true);
      if (plan.searchDepth === "advanced") expect(plan.chunksPerSource).toBe(2);
      else expect(plan.chunksPerSource).toBeUndefined();
      expect(plan.researchWindow).toEqual(researchWindow);
    }

    const researchCredits = plans.reduce(
      (total, plan) => total + (plan.searchDepth === "advanced" ? 2 : 1),
      0,
    );
    expect(researchCredits).toBe(15);
  });

  it("uses dated-event or current-state freshness by search purpose", () => {
    expect(recentSignalSearchPlan(company, researchWindow)[0]).toMatchObject({
      searchDepth: "basic",
      researchWindow,
      minimumScore: 0.25,
      freshnessPolicy: "dated_event",
    });
    expect(recentSignalSearchPlan(company, researchWindow)[0].query).toContain(
      "site:acme.example",
    );
    expect(recentSignalSearchPlan(company, researchWindow)[0].query).toContain(
      "press release",
    );
    expect(recentSignalSearchPlan(company, researchWindow)[1].query).toContain(
      "customer story",
    );
    expect(recentSignalSearchPlan(company, researchWindow)[2]).toMatchObject({
      searchDepth: "advanced",
      topic: "news",
      minimumScore: 0.35,
      researchWindow,
      freshnessPolicy: "dated_event",
    });
    expect(securitySignalSearchPlan(company, researchWindow)[1]).toMatchObject({
      searchDepth: "basic",
      topic: "news",
      researchWindow,
      freshnessPolicy: "dated_event",
    });
    for (const plan of hiringSignalSearchPlan(company, researchWindow)) {
      expect(plan.excludeDomains).toContain("linkedin.com");
      expect(plan.excludeDomains).toContain("indeed.com");
      expect(plan).toMatchObject({
        freshnessPolicy: "current_state",
        companyDomain: "acme.example",
        allowUndatedJobPosting: true,
      });
    }
    expect(securitySignalSearchPlan(company, researchWindow)[0].freshnessPolicy)
      .toBe("current_state");
    expect(technologySignalSearchPlan(company, researchWindow).map((plan) => plan.freshnessPolicy))
      .toEqual(["dated_event", "current_state", "current_state"]);
  });

  it("covers Torq-relevant integration surfaces in the technology plan", () => {
    const plan = technologySignalSearchPlan(company, researchWindow);
    const queries = plan.map((item) => item.query).join(" ");

    expect(plan.map((item) => item.searchDepth)).toEqual(["advanced", "basic", "basic"]);
    expect(queries).toContain("SIEM");
    expect(queries).toContain("EDR");
    expect(queries).toContain("IAM");
    expect(queries).toContain("ServiceNow");
    expect(queries).toContain("site:acme.example");
  });

  it("uses item-specific company posts but not blog or newsroom indexes", () => {
    expect(
      selectRecentFirstPartyUrls(
        [
          {
            url: "https://acme.example/blog",
            title: "Acme blog",
            description: "Company articles",
          },
          {
            url: "https://acme.example/newsroom/",
            title: "Newsroom",
            description: "Company news",
          },
          {
            url: "https://acme.example/blog/security-launch",
            title: "Acme launches security product",
            description: "Product announcement",
          },
          {
            url: "https://acme.example/press/acquisition",
            title: "Acme acquisition announcement",
            description: "Press release",
          },
          {
            url: "https://blog.acme.example/2026/company-update",
            title: "Company update",
            description: "Leadership announcement",
          },
          {
            url: "https://publisher.example/news/acme",
            title: "External story",
            description: "Acme news",
          },
        ],
        company,
        3,
      ),
    ).toEqual([
      "https://acme.example/blog/security-launch",
      "https://acme.example/press/acquisition",
      "https://blog.acme.example/2026/company-update",
    ]);
  });
});
