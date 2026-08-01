import { z } from "zod";
import type { Evidence, Source } from "./schemas";
import {
  isGenericEvidenceSource,
  isSpecificJobPostingSource,
} from "./evidence-quality";

// Research uses one UTC calendar window per company run. Computing it once prevents a
// long-running graph from crossing midnight with different dates in different nodes.
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && formatUtcDate(parsed) === value;
}

export const ResearchWindowSchema = z
  .object({
    today: z.string().refine(isValidDateOnly, "today must be a valid YYYY-MM-DD date"),
    oneYearAgo: z
      .string()
      .refine(isValidDateOnly, "oneYearAgo must be a valid YYYY-MM-DD date"),
  })
  .strict()
  .refine(
    (window) => window.oneYearAgo <= window.today,
    "oneYearAgo must not be after today",
  );

export type ResearchWindow = z.infer<typeof ResearchWindowSchema>;

export type EvidenceCorpus = {
  sources: Source[];
  evidence: Evidence[];
};

export type CurrentStateSourcePolicy = {
  companyDomain: string;
  allowOfficialPage?: boolean;
  allowJobPosting?: boolean;
};

export function createResearchWindow(now: Date = new Date()): ResearchWindow {
  if (Number.isNaN(now.getTime())) throw new Error("Research start time must be valid.");

  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const previousYear = today.getUTCFullYear() - 1;
  const month = today.getUTCMonth();
  // Clamp February 29 to February 28 when the previous year is not a leap year.
  const lastDayOfMonth = new Date(Date.UTC(previousYear, month + 1, 0)).getUTCDate();
  const oneYearAgo = new Date(
    Date.UTC(previousYear, month, Math.min(today.getUTCDate(), lastDayOfMonth)),
  );

  return ResearchWindowSchema.parse({
    today: formatUtcDate(today),
    oneYearAgo: formatUtcDate(oneYearAgo),
  });
}

export function sourceIsWithinResearchWindow(
  publishedAt: string | null,
  window: ResearchWindow,
): boolean {
  if (!publishedAt) return false;
  const parsed = new Date(publishedAt);
  if (Number.isNaN(parsed.getTime())) return false;
  const publishedDate = formatUtcDate(parsed);
  return publishedDate >= window.oneYearAgo && publishedDate <= window.today;
}

function hostMatchesCompany(url: string, companyDomain: string): boolean {
  const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  const domain = companyDomain.replace(/^www\./, "").toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

function dateTimeIsWithinResearchWindow(
  value: string,
  window: ResearchWindow,
): boolean {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const date = formatUtcDate(parsed);
  return date >= window.oneYearAgo && date <= window.today;
}

function isUndatedOfficialCurrentPage(
  source: Source,
  companyDomain: string,
): boolean {
  if (!hostMatchesCompany(source.url, companyDomain)) return false;
  const path = new URL(source.url).pathname;
  // Undated event-like pages are not current-state evidence. They still need a real
  // publication date inside the window, even when the company published them.
  if (/\/(blog|news|newsroom|press|media|announcements?|events?|updates?)(\/|$)/i.test(path)) {
    return false;
  }
  return source.sourceType === "company" || !isGenericEvidenceSource(source);
}

export function sourceSupportsCurrentState(
  source: Source,
  evidence: Evidence,
  window: ResearchWindow,
  policy: CurrentStateSourcePolicy,
): boolean {
  if (source.publishedAt) {
    return sourceIsWithinResearchWindow(source.publishedAt, window);
  }
  if (!dateTimeIsWithinResearchWindow(evidence.collectedAt, window)) return false;

  return Boolean(
    (policy.allowOfficialPage &&
      isUndatedOfficialCurrentPage(source, policy.companyDomain)) ||
      (policy.allowJobPosting && isSpecificJobPostingSource(source)),
  );
}

export function filterCorpusToResearchWindow<T extends EvidenceCorpus>(
  corpus: T,
  window: ResearchWindow,
): T {
  const parsedWindow = ResearchWindowSchema.parse(window);
  const retainedSources = corpus.sources.filter((source) =>
    sourceIsWithinResearchWindow(source.publishedAt, parsedWindow),
  );
  const retainedSourceIds = new Set(retainedSources.map((source) => source.id));

  return {
    ...corpus,
    sources: retainedSources,
    evidence: corpus.evidence.filter((item) => retainedSourceIds.has(item.sourceId)),
  };
}

export function filterCorpusToCurrentStateWindow<T extends EvidenceCorpus>(
  corpus: T,
  window: ResearchWindow,
  policy: CurrentStateSourcePolicy,
): T {
  const parsedWindow = ResearchWindowSchema.parse(window);
  const sourceById = new Map(corpus.sources.map((source) => [source.id, source]));
  const evidence = corpus.evidence.filter((item) => {
    const source = sourceById.get(item.sourceId);
    return source
      ? sourceSupportsCurrentState(source, item, parsedWindow, policy)
      : false;
  });
  const retainedSourceIds = new Set(evidence.map((item) => item.sourceId));

  return {
    ...corpus,
    sources: corpus.sources.filter((source) => retainedSourceIds.has(source.id)),
    evidence,
  };
}

export function researchWindowLabel(window: ResearchWindow): string {
  return `${window.oneYearAgo} through ${window.today}`;
}
