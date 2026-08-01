import { randomUUID } from "node:crypto";
import {
  CompanyResolutionSchema,
  type CompanyCandidate,
  type CompanyResolution,
} from "./schemas";
import { normalizeCompanyCandidates } from "./company-normalization";
import { searchTavily, type ResearchCorpus } from "./tools";

// Resolution answers only "which public website might represent this name?" It never
// grants permission to research; that decision stays in the browser confirmation step.

const NON_COMPANY_HOSTS = [
  "bloomberg.com",
  "crunchbase.com",
  "facebook.com",
  "forbes.com",
  "instagram.com",
  "linkedin.com",
  "reuters.com",
  "twitter.com",
  "wikipedia.org",
  "x.com",
  "youtube.com",
];

function hostFor(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
}

function isCandidateHost(host: string): boolean {
  return !NON_COMPANY_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

function candidateName(title: string, fallback: string): string {
  const firstSegment = title.split(/\s(?:\||—|–|-|:)\s/)[0]?.trim();
  return firstSegment || fallback;
}

function comparisonKey(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

export function domainFromInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;

  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    const host = parsed.hostname.replace(/^www\./, "").toLocaleLowerCase();
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

function domainMatches(candidateDomain: string | null, inputDomain: string): boolean {
  if (!candidateDomain) return false;
  return (
    candidateDomain === inputDomain ||
    candidateDomain.endsWith(`.${inputDomain}`) ||
    inputDomain.endsWith(`.${candidateDomain}`)
  );
}

function nameMatches(candidate: CompanyCandidate, inputName: string): boolean {
  const inputKey = comparisonKey(inputName);
  const nameKey = comparisonKey(candidate.name);
  const domainKey = comparisonKey(candidate.domain?.split(".")[0] ?? "");
  if (!inputKey) return false;
  return (
    nameKey === inputKey ||
    nameKey.startsWith(inputKey) ||
    inputKey.startsWith(nameKey) ||
    domainKey === inputKey ||
    domainKey.startsWith(inputKey)
  );
}

function officialWebsiteScore(candidate: CompanyCandidate, inputName: string): number {
  const inputDomain = domainFromInput(inputName);
  if (inputDomain && domainMatches(candidate.domain, inputDomain)) return 1_000;

  const inputKey = comparisonKey(inputName);
  const nameKey = comparisonKey(candidate.name);
  const domain = candidate.domain ?? "";
  const domainStem = comparisonKey(domain.split(".")[0] ?? "");
  let score = 0;
  if (domain === `${inputKey}.com`) score += 500;
  if (domainStem === inputKey) score += 400;
  if (nameKey === inputKey) score += 300;
  if (nameKey.startsWith(inputKey)) score += 150;
  score -= Math.max(0, domain.split(".").length - 2) * 25;
  return score;
}

export function candidatesFromCorpus(
  inputName: string,
  researchId: string,
  corpus: ResearchCorpus,
): CompanyCandidate[] {
  // Results are grouped by host so several matching pages become one candidate rather
  // than misleading the user with duplicates from the same website.
  const evidenceBySource = new Map(corpus.evidence.map((item) => [item.sourceId, item.excerpt]));
  const grouped = new Map<string, CompanyCandidate>();
  const inputDomain = domainFromInput(inputName);

  for (const source of corpus.sources) {
    const host = hostFor(source.url);
    if (!isCandidateHost(host)) continue;
    const groupedHost = inputDomain && domainMatches(host, inputDomain) ? inputDomain : host;
    const existing = grouped.get(groupedHost);
    if (existing) {
      existing.sourceIds.push(source.id);
      continue;
    }

    grouped.set(groupedHost, {
      id: `${researchId}:C${grouped.size + 1}`,
      name: candidateName(source.title, inputName),
      domain: groupedHost,
      websiteUrl: inputDomain && groupedHost === inputDomain
        ? `https://${inputDomain}`
        : new URL(source.url).origin,
      description: evidenceBySource.get(source.id)?.slice(0, 260) ?? "No description was returned.",
      sourceIds: [source.id],
    });
  }

  return [...grouped.values()]
    .sort((left, right) => officialWebsiteScore(right, inputName) - officialWebsiteScore(left, inputName))
    .slice(0, 4);
}

export async function resolveCompanyName(
  inputName: string,
  search: typeof searchTavily = searchTavily,
  normalize: typeof normalizeCompanyCandidates = normalizeCompanyCandidates,
): Promise<CompanyResolution> {
  // The UUID is created before discovery and follows this company through normalization,
  // the eventual graph run, progress events, report output, and LangSmith traces.
  const researchId = randomUUID();
  const inputDomain = domainFromInput(inputName);
  const corpus = await search({
    query: inputDomain
      ? `"${inputDomain}" official company homepage primary website`
      : `"${inputName}" official company homepage primary website`,
    idPrefix: "RES",
    sourceType: "other",
    maxResults: 10,
    ...(inputDomain ? { includeDomains: [inputDomain] } : {}),
  });
  const discovered = candidatesFromCorpus(inputName, researchId, corpus);
  const plausible = inputDomain
    ? discovered.filter((candidate) => domainMatches(candidate.domain, inputDomain))
    : discovered.filter((candidate) => nameMatches(candidate, inputName));
  const candidates = plausible.length > 0 ? plausible : discovered;
  const normalizedCandidates = await normalize(inputName, candidates, { researchId });
  const status = normalizedCandidates.length === 0
    ? "not_found"
    : normalizedCandidates.length === 1
      ? "unique"
      : "ambiguous";

  return CompanyResolutionSchema.parse({
    researchId,
    inputName,
    status,
    candidates: normalizedCandidates,
    sources: corpus.sources,
    gaps: status === "not_found" ? ["No plausible official company website was found."] : [],
  });
}

export function normalizeCompanyNames(names: string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of names) {
    const name = value.replace(/\s+/g, " ").trim();
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    normalized.push(name);
  }

  if (normalized.length === 0 || normalized.length > 5) {
    throw new Error("Enter between one and five unique company names or domains.");
  }
  return normalized;
}
