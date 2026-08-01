import type { ResolvedCompany } from "./schemas";
import type { TavilySearchInput } from "./tools";

// Search plans are fixed code rather than model output. That keeps provider spend and
// source breadth predictable while allowing the demo to use any relevant public result.
export type FocusedSearchPlan = Omit<TavilySearchInput, "idPrefix" | "sourceType">;

function identity(company: ResolvedCompany): string {
  return `"${company.name}" ${company.domain}`;
}

export function selectRecentFirstPartyUrls(
  links: Array<{ url: string; title: string; description: string }>,
  company: ResolvedCompany,
  limit = 2,
): string[] {
  const officialDomain = company.domain.replace(/^www\./, "");
  const recentSection = /\/(blog|news|newsroom|press|press-releases?|media|announcements?|updates?)\//i;
  const recentLanguage =
    /blog|news|press|announce|launch|funding|acquisition|partnership|appoint|leadership/i;
  const genericSection =
    /^\/(blog|news|newsroom|press|press-releases?|media|announcements?|updates?)\/?$/i;

  return links
    .filter((link) => {
      const parsed = new URL(link.url);
      const candidateHost = parsed.hostname.replace(/^www\./, "");
      if (
        candidateHost !== officialDomain &&
        !candidateHost.endsWith(`.${officialDomain}`)
      ) {
        return false;
      }
      if (parsed.pathname === "/" || genericSection.test(parsed.pathname)) return false;
      return (
        recentSection.test(parsed.pathname) ||
        recentLanguage.test(`${link.title} ${link.description}`)
      );
    })
    .map((link) => link.url)
    .filter((url, index, values) => values.indexOf(url) === index)
    .slice(0, limit);
}

const advancedSearch = {
  searchDepth: "advanced" as const,
  chunksPerSource: 2 as const,
  maxResults: 5,
};

const basicSearch = {
  searchDepth: "basic" as const,
  maxResults: 5,
};

export function recentSignalSearchPlan(company: ResolvedCompany): FocusedSearchPlan[] {
  const target = identity(company);
  return [
    {
      ...basicSearch,
      query: `site:${company.domain} "${company.name}" launches announces acquisition funding partnership leadership product update press release`,
      topic: "news",
    },
    {
      ...basicSearch,
      query: `site:${company.domain} "${company.name}" blog report guide research customer story security compliance company update`,
      topic: "news",
    },
    {
      ...advancedSearch,
      query: `${target} funding product launch acquisition leadership announcement`,
      topic: "news",
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
    },
    {
      ...advancedSearch,
      query: `${target} open platform engineering DevSecOps infrastructure IT automation job role`,
      topic: "general",
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
    },
  ];
}
