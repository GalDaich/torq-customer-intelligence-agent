import { randomUUID } from "node:crypto";
import {
  CompanyResolutionSchema,
  type CompanyCandidate,
  type CompanyResolution,
} from "./schemas";
import { searchTavily, type ResearchCorpus } from "./tools";

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

export function candidatesFromCorpus(
  inputName: string,
  researchId: string,
  corpus: ResearchCorpus,
): CompanyCandidate[] {
  const evidenceBySource = new Map(corpus.evidence.map((item) => [item.sourceId, item.excerpt]));
  const grouped = new Map<string, CompanyCandidate>();

  for (const source of corpus.sources) {
    const host = hostFor(source.url);
    if (!isCandidateHost(host)) continue;
    const existing = grouped.get(host);
    if (existing) {
      existing.sourceIds.push(source.id);
      continue;
    }

    grouped.set(host, {
      id: `${researchId}:C${grouped.size + 1}`,
      name: candidateName(source.title, inputName),
      domain: host,
      websiteUrl: new URL(source.url).origin,
      description: evidenceBySource.get(source.id)?.slice(0, 260) ?? "No description was returned.",
      sourceIds: [source.id],
    });
  }

  return [...grouped.values()].slice(0, 4);
}

export async function resolveCompanyName(
  inputName: string,
  search: typeof searchTavily = searchTavily,
): Promise<CompanyResolution> {
  const researchId = randomUUID();
  const corpus = await search({
    query: `"${inputName}" company official website about`,
    idPrefix: "RES",
    sourceType: "other",
    maxResults: 6,
  });
  const candidates = candidatesFromCorpus(inputName, researchId, corpus);
  const status = candidates.length === 0 ? "not_found" : candidates.length === 1 ? "unique" : "ambiguous";

  return CompanyResolutionSchema.parse({
    researchId,
    inputName,
    status,
    candidates,
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
    throw new Error("Enter between one and five unique company names.");
  }
  return normalized;
}
