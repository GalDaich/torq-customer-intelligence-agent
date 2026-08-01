import type {
  Evidence,
  GroundedClaim,
  HiringSignal,
  Source,
  TechnologySignal,
} from "./schemas";

const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
]);

const GENERIC_HIRING_TITLES = /^(careers?|jobs?|job openings?|open positions?|opportunities|join (our|the) team)( at .+)?$/i;
const GENERIC_HIRING_PATH = /\/(careers?|jobs?|job-openings?|open-positions?|opportunities|work-with-us)\/?$/i;
const GENERIC_NEWS_TITLE = /^(blog|media|news|newsroom|press|press releases?|resources)$/i;
const GENERIC_NEWS_PATH = /\/(blog|media|news|newsroom|press|press-releases?|resources)\/?$/i;
const GENERIC_TECHNOLOGY_TITLE = /^(engineering|technology|tech stack|stack|developers?|documentation|careers?|jobs?)$/i;
const GENERIC_TECHNOLOGY_PATH = /\/(engineering|technology|tech|developers?|docs?|careers?|jobs?)\/?$/i;

export type EvidenceCorpus = {
  sources: Source[];
  evidence: Evidence[];
};

export function canonicalEvidenceUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");

  for (const parameter of [...url.searchParams.keys()]) {
    if (parameter.toLowerCase().startsWith("utm_") || TRACKING_PARAMETERS.has(parameter.toLowerCase())) {
      url.searchParams.delete(parameter);
    }
  }
  url.searchParams.sort();

  if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

export function evidenceFingerprint(text: string): string {
  return text.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isGenericHiringSource(source: Pick<Source, "title" | "url">): boolean {
  const url = new URL(source.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const normalizedTitle = source.title.replace(/\s+/g, " ").trim();

  if (path === "/" || GENERIC_HIRING_TITLES.test(normalizedTitle)) return true;
  if (GENERIC_HIRING_PATH.test(path)) return true;
  if (/\/jobs?\/search\/?$/i.test(path)) return true;
  if (/\/company\/[^/]+\/jobs?\/?$/i.test(path)) return true;
  if (/\/cmp\/[^/]+\/jobs?\/?$/i.test(path)) return true;

  return false;
}

export function isGenericEvidenceSource(
  source: Pick<Source, "sourceType" | "title" | "url">,
): boolean {
  if (source.sourceType === "hiring") return isGenericHiringSource(source);

  const url = new URL(source.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const normalizedTitle = source.title.replace(/\s+/g, " ").trim();

  if (source.sourceType === "news") {
    return path === "/" || GENERIC_NEWS_PATH.test(path) || GENERIC_NEWS_TITLE.test(normalizedTitle);
  }
  if (source.sourceType === "security") return path === "/";
  if (source.sourceType === "technology") {
    return path === "/" || GENERIC_TECHNOLOGY_PATH.test(path) || GENERIC_TECHNOLOGY_TITLE.test(normalizedTitle);
  }

  return false;
}

function normalizedTechnology(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isAtomicTechnologyName(value: string): boolean {
  return !(/\s+(and|&)\s+|[,;/]/i.test(value));
}

export function technologySignalsDescribeSameTechnology(
  left: TechnologySignal,
  right: TechnologySignal,
): boolean {
  return normalizedTechnology(left.technology) === normalizedTechnology(right.technology);
}

function normalizedJobField(value: string | null): string {
  return (value ?? "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function hiringSignalsDescribeSamePosition(
  left: HiringSignal,
  right: HiringSignal,
): boolean {
  if (normalizedJobField(left.roleTitle) !== normalizedJobField(right.roleTitle)) return false;

  const leftTeam = normalizedJobField(left.team);
  const rightTeam = normalizedJobField(right.team);
  if (leftTeam && rightTeam && leftTeam !== rightTeam) return false;

  const leftLocation = normalizedJobField(left.location);
  const rightLocation = normalizedJobField(right.location);
  if (leftLocation && rightLocation && leftLocation !== rightLocation) return false;

  return true;
}

export function retainEvidenceForClaims(
  corpus: EvidenceCorpus,
  claims: GroundedClaim[],
): EvidenceCorpus {
  const requestedEvidenceIds = new Set(claims.flatMap((claim) => claim.evidenceIds));
  const availableEvidenceIds = new Set(corpus.evidence.map((evidence) => evidence.id));
  for (const evidenceId of requestedEvidenceIds) {
    if (!availableEvidenceIds.has(evidenceId)) {
      throw new Error(`Model selected unknown evidence ${evidenceId}.`);
    }
  }

  const evidence = corpus.evidence.filter((item) => requestedEvidenceIds.has(item.id));
  const requestedSourceIds = new Set(evidence.map((item) => item.sourceId));
  const sources = corpus.sources.filter((source) => requestedSourceIds.has(source.id));
  return { sources, evidence };
}

export function retainStrongHiringEvidence(
  corpus: EvidenceCorpus,
  signals: HiringSignal[],
): EvidenceCorpus {
  const sourceById = new Map(corpus.sources.map((source) => [source.id, source]));
  const evidenceById = new Map(corpus.evidence.map((evidence) => [evidence.id, evidence]));

  for (let leftIndex = 0; leftIndex < signals.length; leftIndex += 1) {
    const signal = signals[leftIndex];
    if (signal.claim.evidenceIds.length !== 1) {
      throw new Error(`Hiring signal ${signal.roleTitle} must select exactly one evidence record.`);
    }
    const evidence = evidenceById.get(signal.claim.evidenceIds[0]);
    const source = evidence ? sourceById.get(evidence.sourceId) : undefined;
    if (!source || source.sourceType !== "hiring" || isGenericHiringSource(source)) {
      throw new Error(`Hiring signal ${signal.roleTitle} selected weak or generic evidence.`);
    }

    for (let rightIndex = leftIndex + 1; rightIndex < signals.length; rightIndex += 1) {
      if (hiringSignalsDescribeSamePosition(signal, signals[rightIndex])) {
        throw new Error(`Hiring signal ${signal.roleTitle} was selected more than once.`);
      }
    }
  }

  return retainEvidenceForClaims(corpus, signals.map((signal) => signal.claim));
}

export function retainStrongTechnologyEvidence(
  corpus: EvidenceCorpus,
  signals: TechnologySignal[],
): EvidenceCorpus {
  const sourceById = new Map(corpus.sources.map((source) => [source.id, source]));
  const evidenceById = new Map(corpus.evidence.map((evidence) => [evidence.id, evidence]));

  for (let leftIndex = 0; leftIndex < signals.length; leftIndex += 1) {
    const signal = signals[leftIndex];
    if (!isAtomicTechnologyName(signal.technology)) {
      throw new Error(`Technology signal ${signal.technology} must name exactly one technology.`);
    }
    const claimEvidenceIds = signal.claim.evidenceIds;
    const relevanceEvidenceIds = signal.torqRelevance.evidenceIds;
    if (
      claimEvidenceIds.length !== 1 ||
      relevanceEvidenceIds.length !== 1 ||
      claimEvidenceIds[0] !== relevanceEvidenceIds[0]
    ) {
      throw new Error(`Technology signal ${signal.technology} must use one shared evidence record.`);
    }
    const evidence = evidenceById.get(claimEvidenceIds[0]);
    const source = evidence ? sourceById.get(evidence.sourceId) : undefined;
    if (!source || source.sourceType !== "technology" || isGenericEvidenceSource(source)) {
      throw new Error(`Technology signal ${signal.technology} selected weak or generic evidence.`);
    }

    for (let rightIndex = leftIndex + 1; rightIndex < signals.length; rightIndex += 1) {
      if (technologySignalsDescribeSameTechnology(signal, signals[rightIndex])) {
        throw new Error(`Technology signal ${signal.technology} was selected more than once.`);
      }
    }
  }

  return retainEvidenceForClaims(
    corpus,
    signals.flatMap((signal) => [signal.claim, signal.torqRelevance]),
  );
}
