import type { ResolvedCompany } from "./schemas";
import type { TavilySearchInput } from "./tools";

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

const preciseSearch = {
  searchDepth: "advanced" as const,
  chunksPerSource: 2 as const,
  maxResults: 5,
  minimumScore: 0.45,
};

export function recentSignalSearchPlan(company: ResolvedCompany): FocusedSearchPlan[] {
  const target = identity(company);
  return [
    {
      ...preciseSearch,
      query: `site:${company.domain} "${company.name}" funding acquisition expansion leadership announcement`,
      topic: "general",
      timeRange: "year",
    },
    {
      ...preciseSearch,
      query: `site:${company.domain} "${company.name}" product launch partnership announcement`,
      topic: "general",
      timeRange: "year",
    },
    {
      ...preciseSearch,
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
      ...preciseSearch,
      query: `${target} open security SOC incident response cloud security identity job role`,
      topic: "general",
      excludeDomains: JOB_AGGREGATORS,
    },
    {
      ...preciseSearch,
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
      ...preciseSearch,
      query: `${target} security operations SOC incident response compliance security team automation`,
      topic: "general",
    },
    {
      ...preciseSearch,
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
      ...preciseSearch,
      query: `${target} publicly used SIEM EDR XDR IAM cloud security tools technology stack`,
      topic: "general",
    },
    {
      ...preciseSearch,
      query: `site:${company.domain} engineering architecture AWS Azure GCP Kubernetes security stack`,
      topic: "general",
    },
    {
      ...preciseSearch,
      query: `${target} jobs Splunk Sentinel CrowdStrike Okta Wiz ServiceNow Jira Slack`,
      topic: "general",
      excludeDomains: JOB_AGGREGATORS,
    },
  ];
}
