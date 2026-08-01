import type { Evidence, GroundedClaim, Source } from "./schemas";

const TRACKING_PARAMETERS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "source",
]);

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

export function retainEvidenceForClaims(
  corpus: EvidenceCorpus,
  claims: GroundedClaim[],
): EvidenceCorpus {
  const requestedEvidenceIds = new Set(claims.flatMap((claim) => claim.evidenceIds));
  // Unknown model-authored IDs are not forwarded, but they do not erase other valid
  // evidence from the same specialist. Final restoration removes only the bad finding.
  const evidence = corpus.evidence.filter((item) => requestedEvidenceIds.has(item.id));
  const requestedSourceIds = new Set(evidence.map((item) => item.sourceId));
  const sources = corpus.sources.filter((source) => requestedSourceIds.has(source.id));
  return { sources, evidence };
}
