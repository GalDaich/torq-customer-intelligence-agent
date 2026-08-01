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
import {
  researchWindowLabel,
  sourceSupportsCurrentState,
  sourceIsWithinResearchWindow,
  type ResearchWindow,
} from "./research-window";

// This is the final trust boundary. It validates model-authored reports against retrieved
// lineage and can omit unsafe optional findings, but it never rewrites or invents claims.

export class GroundingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroundingValidationError";
  }
}

type ClaimFreshnessMode = "dated_event" | "company_state" | "job_state" | "current_state";

function evidenceSupportsFreshness(
  report: CompanyReport,
  evidence: CompanyReport["evidence"][number],
  source: CompanyReport["sources"][number],
  researchWindow: ResearchWindow | undefined,
  mode: ClaimFreshnessMode,
): boolean {
  if (!researchWindow) return true;
  if (mode === "dated_event") {
    return sourceIsWithinResearchWindow(source.publishedAt, researchWindow);
  }
  if (mode === "company_state" && source.sourceType !== "company") return false;
  if (mode === "job_state" && source.sourceType !== "hiring") return false;

  return sourceSupportsCurrentState(source, evidence, researchWindow, {
    companyDomain: report.company.domain,
    allowOfficialPage: mode !== "job_state",
    allowJobPosting: mode !== "company_state",
  });
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
  sourceById: Map<string, CompanyReport["sources"][number]>,
  eligible: (
    evidence: CompanyReport["evidence"][number],
    source: CompanyReport["sources"][number],
  ) => boolean = () => true,
): GroundedClaim | null {
  const evidenceIds = [...new Set(claim.evidenceIds)].filter((evidenceId) => {
    const evidence = evidenceById.get(evidenceId);
    const source = evidence ? sourceById.get(evidence.sourceId) : undefined;
    return evidence && source ? eligible(evidence, source) : false;
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
 * Restores a schema-valid synthesized report by omitting structurally unsafe optional findings.
 * It never rewrites claim text or invents evidence; every omission becomes a visible report gap.
 */
export function restoreGroundedReport(
  input: unknown,
  researchWindow?: ResearchWindow,
): CompanyReport {
  const report = CompanyReportSchema.parse(input);
  const sourceById = new Map(report.sources.map((source) => [source.id, source]));
  const evidenceById = new Map(report.evidence.map((evidence) => [evidence.id, evidence]));
  const omissions: string[] = [];
  const eligible = (mode: ClaimFreshnessMode) => (
    evidence: CompanyReport["evidence"][number],
    source: CompanyReport["sources"][number],
  ) => evidenceSupportsFreshness(report, evidence, source, researchWindow, mode);

  const whatTheyDo = report.whatTheyDo
    ? groundedClaim(report.whatTheyDo, evidenceById, sourceById, eligible("company_state"))
    : null;
  if (!whatTheyDo) {
    omissions.push("The company description was omitted because its supporting evidence was unavailable.");
  }

  const recentSignals = report.recentSignals.flatMap((signal) => {
    const claim = groundedClaim(signal.claim, evidenceById, sourceById, eligible("dated_event"));
    return claim ? [{ ...signal, claim }] : [];
  });
  if (recentSignals.length !== report.recentSignals.length) {
    omissions.push("Some recent signals were omitted because their supporting evidence was unavailable.");
  }

  const hiringSignals: CompanyReport["hiringSignals"] = [];
  for (const signal of report.hiringSignals) {
    const claim = groundedClaim(signal.claim, evidenceById, sourceById, eligible("job_state"));
    const evidence = claim?.evidenceIds.length === 1
      ? evidenceById.get(claim.evidenceIds[0])
      : undefined;
    const source = evidence ? sourceById.get(evidence.sourceId) : undefined;
    const duplicate = hiringSignals.some((retained) =>
      hiringSignalsDescribeSamePosition(signal, retained));
    if (
      !claim ||
      claim.evidenceIds.length !== 1 ||
      !source ||
      source.sourceType !== "hiring" ||
      isGenericHiringSource(source) ||
      duplicate
    ) {
      continue;
    }
    hiringSignals.push({ ...signal, claim });
  }
  if (hiringSignals.length !== report.hiringSignals.length) {
    omissions.push("Some hiring signals were omitted because they were duplicate, generic, or lacked one specific supporting source.");
  }

  const securitySignals = report.securitySignals.flatMap((signal) => {
    const mode = signal.category === "incident" ? "dated_event" : "current_state";
    const claim = groundedClaim(signal.claim, evidenceById, sourceById, eligible(mode));
    const whyItMatters = groundedClaim(signal.whyItMatters, evidenceById, sourceById, eligible(mode));
    return claim && whyItMatters ? [{ ...signal, claim, whyItMatters }] : [];
  });
  if (securitySignals.length !== report.securitySignals.length) {
    omissions.push("Some security signals were omitted because their supporting evidence was unavailable.");
  }

  const technologySignals: CompanyReport["technologySignals"] = [];
  for (const signal of report.technologySignals) {
    const claim = groundedClaim(signal.claim, evidenceById, sourceById, eligible("current_state"));
    const torqRelevance = groundedClaim(signal.torqRelevance, evidenceById, sourceById, eligible("current_state"));
    const sharedEvidenceId = claim?.evidenceIds.length === 1 &&
      torqRelevance?.evidenceIds.length === 1 &&
      claim.evidenceIds[0] === torqRelevance.evidenceIds[0]
      ? claim.evidenceIds[0]
      : null;
    const evidence = sharedEvidenceId ? evidenceById.get(sharedEvidenceId) : undefined;
    const source = evidence ? sourceById.get(evidence.sourceId) : undefined;
    const duplicate = technologySignals.some((retained) =>
      technologySignalsDescribeSameTechnology(signal, retained));
    if (
      !claim ||
      !torqRelevance ||
      !sharedEvidenceId ||
      !source ||
      isGenericEvidenceSource(source) ||
      !isAtomicTechnologyName(signal.technology) ||
      duplicate
    ) {
      continue;
    }
    technologySignals.push({ ...signal, claim, torqRelevance });
  }
  if (technologySignals.length !== report.technologySignals.length) {
    omissions.push("Some technology signals were omitted because they grouped multiple tools, were duplicate, generic, or lacked one specific supporting source.");
  }

  const likelyPainPoints = report.likelyPainPoints.flatMap((item) => {
    const rationale = groundedClaim(item.rationale, evidenceById, sourceById, eligible("current_state"));
    return rationale ? [{ ...item, rationale }] : [];
  });
  if (likelyPainPoints.length !== report.likelyPainPoints.length) {
    omissions.push("Some pain-point hypotheses were omitted because their supporting evidence was unavailable.");
  }

  const talkingPoints = report.talkingPoints.flatMap((item) => {
    const rationale = groundedClaim(item.rationale, evidenceById, sourceById, eligible("current_state"));
    return rationale ? [{ ...item, rationale }] : [];
  });
  if (talkingPoints.length !== report.talkingPoints.length) {
    omissions.push("Some talking points were omitted because their supporting evidence was unavailable.");
  }
  if (likelyPainPoints.length === 0) {
    omissions.push("The available evidence did not support a responsible security-automation pain-point hypothesis.");
  }
  if (talkingPoints.length < 2) {
    omissions.push("The available evidence did not support two responsible company-specific talking points.");
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
  return validateGroundedReport(retainCitedLineage(restored), researchWindow);
}

function uniqueIds(ids: string[], label: string): Set<string> {
  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    throw new GroundingValidationError(`${label} IDs must be unique.`);
  }
  return unique;
}

export function retainCitedLineage(report: CompanyReport): CompanyReport {
  // Reports retain only evidence cited by visible claims and only sources reached by that
  // evidence, keeping unused search material out of the user-facing artifact.
  const citedEvidenceIds = new Set(allClaims(report).flatMap((claim) => claim.evidenceIds));
  const evidence = report.evidence.filter((item) => citedEvidenceIds.has(item.id));
  const citedSourceIds = new Set(evidence.map((item) => item.sourceId));
  const sources = report.sources.filter((source) => citedSourceIds.has(source.id));

  return CompanyReportSchema.parse({ ...report, sources, evidence });
}

export function validateGroundedReport(
  input: unknown,
  researchWindow?: ResearchWindow,
): CompanyReport {
  // Validation is intentionally strict: every claim must resolve through evidence to one
  // real source, and role/technology findings must stay specific and non-duplicated.
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

  const assertFreshness = (
    claim: GroundedClaim,
    mode: ClaimFreshnessMode,
    label: string,
  ) => {
    if (!researchWindow) return;
    for (const evidenceId of claim.evidenceIds) {
      const evidence = evidenceById.get(evidenceId);
      const source = evidence ? sourceById.get(evidence.sourceId) : undefined;
      if (
        evidence &&
        source &&
        !evidenceSupportsFreshness(report, evidence, source, researchWindow, mode)
      ) {
        const requirement = mode === "dated_event"
          ? "a source published"
          : "an eligible current page published or observed";
        throw new GroundingValidationError(
          `${label} must cite ${requirement} within ${researchWindowLabel(researchWindow)}.`,
        );
      }
    }
  };

  if (report.whatTheyDo) {
    assertFreshness(report.whatTheyDo, "company_state", "Company description");
  }
  for (const signal of report.recentSignals) {
    assertFreshness(signal.claim, "dated_event", "Recent signal");
  }
  for (const signal of report.hiringSignals) {
    assertFreshness(signal.claim, "job_state", `Hiring signal ${signal.roleTitle}`);
  }
  for (const signal of report.securitySignals) {
    const mode = signal.category === "incident" ? "dated_event" : "current_state";
    assertFreshness(signal.claim, mode, "Security signal");
    assertFreshness(signal.whyItMatters, mode, "Security relevance");
  }
  for (const signal of report.technologySignals) {
    assertFreshness(signal.claim, "current_state", `Technology signal ${signal.technology}`);
    assertFreshness(signal.torqRelevance, "current_state", `Technology relevance ${signal.technology}`);
  }
  for (const item of report.likelyPainPoints) {
    assertFreshness(item.rationale, "current_state", "Pain-point rationale");
  }
  for (const item of report.talkingPoints) {
    assertFreshness(item.rationale, "current_state", "Talking-point rationale");
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
