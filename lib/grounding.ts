import {
  CompanyReportSchema,
  type CompanyReport,
  type GroundedClaim,
} from "./schemas";
import {
  canonicalEvidenceUrl,
  evidenceFingerprint,
  hiringSignalsDescribeSamePosition,
  isAtomicTechnologyName,
  isGenericEvidenceSource,
  isGenericHiringSource,
  technologySignalsDescribeSameTechnology,
} from "./evidence-quality";

export class GroundingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroundingValidationError";
  }
}

function allClaims(report: CompanyReport): GroundedClaim[] {
  return [
    report.whatTheyDo,
    ...report.recentSignals.map((signal) => signal.claim),
    ...report.hiringSignals.map((signal) => signal.claim),
    ...report.securitySignals.flatMap((signal) => [signal.claim, signal.whyItMatters]),
    ...report.technologySignals.flatMap((signal) => [signal.claim, signal.torqRelevance]),
    ...report.likelyPainPoints.map((painPoint) => painPoint.rationale),
    ...report.talkingPoints.map((talkingPoint) => talkingPoint.rationale),
  ];
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
  const sourceIds = uniqueIds(
    report.sources.map((source) => source.id),
    "Source",
  );
  const evidenceIds = uniqueIds(
    report.evidence.map((evidence) => evidence.id),
    "Evidence",
  );
  const sourceById = new Map(report.sources.map((source) => [source.id, source]));
  const evidenceById = new Map(report.evidence.map((evidence) => [evidence.id, evidence]));
  const canonicalUrls = report.sources.map((source) => canonicalEvidenceUrl(source.url));
  if (new Set(canonicalUrls).size !== canonicalUrls.length) {
    throw new GroundingValidationError("Sources must not repeat the same canonical URL.");
  }
  const evidenceFingerprints = report.evidence.map((evidence) => evidenceFingerprint(evidence.excerpt));
  if (new Set(evidenceFingerprints).size !== evidenceFingerprints.length) {
    throw new GroundingValidationError("Evidence excerpts must not be duplicated.");
  }

  for (const evidence of report.evidence) {
    if (!sourceIds.has(evidence.sourceId)) {
      throw new GroundingValidationError(
        `Evidence ${evidence.id} references unknown source ${evidence.sourceId}.`,
      );
    }
  }

  const citedEvidenceIds = new Set<string>();
  for (const claim of allClaims(report)) {
    for (const evidenceId of claim.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        throw new GroundingValidationError(
          `Claim references unknown evidence ${evidenceId}.`,
        );
      }
      citedEvidenceIds.add(evidenceId);
    }
  }

  if (citedEvidenceIds.size !== report.evidence.length) {
    throw new GroundingValidationError("Reports must not retain uncited evidence.");
  }
  const citedSourceIds = new Set(
    report.evidence.map((evidence) => evidence.sourceId),
  );
  if (citedSourceIds.size !== report.sources.length) {
    throw new GroundingValidationError("Reports must not retain sources without cited evidence.");
  }

  for (let leftIndex = 0; leftIndex < report.hiringSignals.length; leftIndex += 1) {
    const hiringSignal = report.hiringSignals[leftIndex];
    if (hiringSignal.claim.evidenceIds.length !== 1) {
      throw new GroundingValidationError(
        `Hiring signal ${hiringSignal.roleTitle} must cite exactly one strongest evidence record.`,
      );
    }
    const evidence = evidenceById.get(hiringSignal.claim.evidenceIds[0]);
    const source = evidence ? sourceById.get(evidence.sourceId) : undefined;
    if (!source || source.sourceType !== "hiring" || isGenericHiringSource(source)) {
      throw new GroundingValidationError(
        `Hiring signal ${hiringSignal.roleTitle} must cite a specific job or article, not a generic careers page.`,
      );
    }

    for (let rightIndex = leftIndex + 1; rightIndex < report.hiringSignals.length; rightIndex += 1) {
      if (hiringSignalsDescribeSamePosition(hiringSignal, report.hiringSignals[rightIndex])) {
        throw new GroundingValidationError(
          `Hiring signal ${hiringSignal.roleTitle} appears more than once.`,
        );
      }
    }
  }

  for (let leftIndex = 0; leftIndex < report.technologySignals.length; leftIndex += 1) {
    const technologySignal = report.technologySignals[leftIndex];
    if (!isAtomicTechnologyName(technologySignal.technology)) {
      throw new GroundingValidationError(
        `Technology signal ${technologySignal.technology} must name exactly one technology.`,
      );
    }
    const claimEvidenceIds = technologySignal.claim.evidenceIds;
    const relevanceEvidenceIds = technologySignal.torqRelevance.evidenceIds;
    if (
      claimEvidenceIds.length !== 1 ||
      relevanceEvidenceIds.length !== 1 ||
      claimEvidenceIds[0] !== relevanceEvidenceIds[0]
    ) {
      throw new GroundingValidationError(
        `Technology signal ${technologySignal.technology} must cite one shared strongest evidence record.`,
      );
    }
    const evidence = evidenceById.get(claimEvidenceIds[0]);
    const source = evidence ? sourceById.get(evidence.sourceId) : undefined;
    // One specific page can legitimately support two nodes (for example, a job posting can
    // support both hiring and technology findings), so canonical-source merging may retain
    // the earlier node's sourceType while preserving the technology node's evidence record.
    if (!source || isGenericEvidenceSource(source)) {
      throw new GroundingValidationError(
        `Technology signal ${technologySignal.technology} must cite a specific technical source.`,
      );
    }

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < report.technologySignals.length;
      rightIndex += 1
    ) {
      if (technologySignalsDescribeSameTechnology(
        technologySignal,
        report.technologySignals[rightIndex],
      )) {
        throw new GroundingValidationError(
          `Technology signal ${technologySignal.technology} appears more than once.`,
        );
      }
    }
  }

  return report;
}
