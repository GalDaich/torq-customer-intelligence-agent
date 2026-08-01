import {
  CompanyReportSchema,
  type CompanyReport,
  type GroundedClaim,
} from "./schemas";

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
