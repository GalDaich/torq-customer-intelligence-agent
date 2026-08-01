import type { ResolvedCompany } from "./schemas";
import type { TavilySearchInput } from "./tools";

// Search plans are fixed code rather than model output. That keeps provider spend,
// recency, source breadth, and excluded aggregators predictable for every company.
export type FocusedSearchPlan = Omit<TavilySearchInput, "idPrefix" | "sourceType">;

const JOB_AGGREGATORS = [
  "glassdoor.com",
  "indeed.com",
  "linkedin.com",
  "simplyhired.com",
  "ziprecruiter.com",
];

function identity(company: ResolvedCompany): string {
  return `"${company.name}" ${company.domain}`;
}

const advancedSearch = {
  searchDepth: "advanced" as const,
  chunksPerSource: 2 as const,
  maxResults: 5,
  minimumScore: 0.45,
};

const basicSearch = {
  searchDepth: "basic" as const,
  maxResults: 5,
  minimumScore: 0.45,
};

export function recentSignalSearchPlan(company: ResolvedCompany): FocusedSearchPlan[] {
  const target = identity(company);
  return [
    {
      ...basicSearch,
      query: `site:${company.domain} "${company.name}" funding acquisition expansion leadership product launch partnership announcement`,
      topic: "general",
      timeRange: "year",
    },
    {
      ...advancedSearch,
      query: `${target} recent funding product launch acquisition leadership announcement`,
      topic: "news",
      timeRange: "year",
      minimumScore: 0.35,
    },
  ];
}

export function hiringSignalSearchPlan(company: ResolvedCompany): FocusedSearchPlan[] {
  const target = identity(company);
  return [
    {
      ...advancedSearch,
      query: `${target} open security SOC incident response cloud security identity job role`,
      topic: "general",
      excludeDomains: JOB_AGGREGATORS,
    },
    {
      ...advancedSearch,
      query: `${target} open platform engineering DevSecOps infrastructure IT automation job role`,
      topic: "general",
      excludeDomains: JOB_AGGREGATORS,
    },
  ];
}

export function securitySignalSearchPlan(company: ResolvedCompany): FocusedSearchPlan[] {
  const target = identity(company);
  return [
    {
      ...advancedSearch,
      query: `${target} security operations SOC incident response compliance security team automation`,
      topic: "general",
    },
    {
      ...basicSearch,
      query: `${target} breach vulnerability cloud security identity phishing threat response`,
      topic: "news",
      timeRange: "year",
    },
  ];
}

export function technologySignalSearchPlan(company: ResolvedCompany): FocusedSearchPlan[] {
  const target = identity(company);
  return [
    {
      ...advancedSearch,
      query: `${target} publicly used SIEM EDR XDR IAM cloud security tools technology stack`,
      topic: "general",
    },
    {
      ...basicSearch,
      query: `site:${company.domain} engineering architecture AWS Azure GCP Kubernetes security stack`,
      topic: "general",
    },
    {
      ...basicSearch,
      query: `${target} jobs Splunk Sentinel CrowdStrike Okta Wiz ServiceNow Jira Slack`,
      topic: "general",
      excludeDomains: JOB_AGGREGATORS,
    },
  ];
}
