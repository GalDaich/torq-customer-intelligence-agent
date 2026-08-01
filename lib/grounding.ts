import {
  CompanyReportSchema,
  type CompanyReport,
  type GroundedClaim,
} from "./schemas";

// The demo trust boundary is intentionally small: claims may use any retrieved public
// evidence, but every cited evidence ID must still resolve to a real retained source URL.
export class GroundingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroundingValidationError";
  }
}

function allClaims(report: CompanyReport): GroundedClaim[] {
  return [
    ...(report.whatTheyDo ? [report.whatTheyDo] : []),
    ...report.recentSignals.map((signal) => signal.claim),
    ...report.hiringSignals.map((signal) => signal.claim),
    ...report.securitySignals.flatMap((signal) => [signal.claim, signal.whyItMatters]),
    ...report.technologySignals.flatMap((signal) => [signal.claim, signal.torqRelevance]),
    ...report.likelyPainPoints.map((painPoint) => painPoint.rationale),
    ...report.talkingPoints.map((talkingPoint) => talkingPoint.rationale),
  ];
}

function groundedClaim(
  claim: GroundedClaim,
  evidenceById: Map<string, CompanyReport["evidence"][number]>,
  sourceIds: Set<string>,
): GroundedClaim | null {
  const evidenceIds = [...new Set(claim.evidenceIds)].filter((evidenceId) => {
    const evidence = evidenceById.get(evidenceId);
    return evidence ? sourceIds.has(evidence.sourceId) : false;
  });
  return evidenceIds.length > 0 ? { ...claim, evidenceIds } : null;
}

function reportGaps(existing: string[], additions: string[]): string[] {
  const added = [...new Set(additions.map((gap) => gap.trim()).filter(Boolean))];
  const retained = [...new Set(existing.map((gap) => gap.trim()).filter(Boolean))]
    .filter((gap) => !added.includes(gap))
    .slice(0, Math.max(0, 6 - added.length));
  return [...retained, ...added].slice(0, 6);
}

/**
 * Keeps every finding that has at least one valid evidence-to-source path. Missing or
 * invented IDs remove only that finding, so an imperfect model response stays useful.
 */
export function restoreGroundedReport(input: unknown): CompanyReport {
  const report = CompanyReportSchema.parse(input);
  const sourceIds = new Set(report.sources.map((source) => source.id));
  const evidenceById = new Map(report.evidence.map((evidence) => [evidence.id, evidence]));
  const omissions: string[] = [];

  const restore = (claim: GroundedClaim) => groundedClaim(claim, evidenceById, sourceIds);
  const whatTheyDo = report.whatTheyDo ? restore(report.whatTheyDo) : null;
  if (report.whatTheyDo && !whatTheyDo) {
    omissions.push("The company description was omitted because its evidence reference was unavailable.");
  }

  const recentSignals = report.recentSignals.flatMap((signal) => {
    const claim = restore(signal.claim);
    return claim ? [{ ...signal, claim }] : [];
  });
  const hiringSignals = report.hiringSignals.flatMap((signal) => {
    const claim = restore(signal.claim);
    return claim ? [{ ...signal, claim }] : [];
  });
  const securitySignals = report.securitySignals.flatMap((signal) => {
    const claim = restore(signal.claim);
    const whyItMatters = restore(signal.whyItMatters);
    return claim && whyItMatters ? [{ ...signal, claim, whyItMatters }] : [];
  });
  const technologySignals = report.technologySignals.flatMap((signal) => {
    const claim = restore(signal.claim);
    const torqRelevance = restore(signal.torqRelevance);
    return claim && torqRelevance ? [{ ...signal, claim, torqRelevance }] : [];
  });
  const likelyPainPoints = report.likelyPainPoints.flatMap((item) => {
    const rationale = restore(item.rationale);
    return rationale ? [{ ...item, rationale }] : [];
  });
  const talkingPoints = report.talkingPoints.flatMap((item) => {
    const rationale = restore(item.rationale);
    return rationale ? [{ ...item, rationale }] : [];
  });

  const omittedCount =
    report.recentSignals.length - recentSignals.length +
    report.hiringSignals.length - hiringSignals.length +
    report.securitySignals.length - securitySignals.length +
    report.technologySignals.length - technologySignals.length +
    report.likelyPainPoints.length - likelyPainPoints.length +
    report.talkingPoints.length - talkingPoints.length;
  if (omittedCount > 0) {
    omissions.push("Some findings were omitted because their evidence references were unavailable.");
  }

  const restored = CompanyReportSchema.parse({
    ...report,
    whatTheyDo,
    recentSignals,
    hiringSignals,
    securitySignals,
    technologySignals,
    likelyPainPoints,
    talkingPoints,
    confidenceAndGaps: reportGaps(report.confidenceAndGaps, omissions),
  });
  return validateGroundedReport(retainCitedLineage(restored));
}

function uniqueIds(ids: string[], label: string): Set<string> {
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    throw new GroundingValidationError(`${label} IDs must be unique.`);
  }
  return unique;
}

export function retainCitedLineage(report: CompanyReport): CompanyReport {
  const citedEvidenceIds = new Set(allClaims(report).flatMap((claim) => claim.evidenceIds));
  const evidence = report.evidence.filter((item) => citedEvidenceIds.has(item.id));
  const citedSourceIds = new Set(evidence.map((item) => item.sourceId));
  const sources = report.sources.filter((source) => citedSourceIds.has(source.id));
  return CompanyReportSchema.parse({ ...report, sources, evidence });
}

export function validateGroundedReport(input: unknown): CompanyReport {
  const report = CompanyReportSchema.parse(input);
  const sourceIds = uniqueIds(report.sources.map((source) => source.id), "Source");
  const evidenceIds = uniqueIds(report.evidence.map((evidence) => evidence.id), "Evidence");

  for (const evidence of report.evidence) {
    if (!sourceIds.has(evidence.sourceId)) {
      throw new GroundingValidationError(
        `Evidence ${evidence.id} references unknown source ${evidence.sourceId}.`,
      );
    }
  }

  for (const claim of allClaims(report)) {
    for (const evidenceId of claim.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        throw new GroundingValidationError(
          `Claim references unknown evidence ${evidenceId}.`,
        );
      }
    }
  }

  return report;
}
