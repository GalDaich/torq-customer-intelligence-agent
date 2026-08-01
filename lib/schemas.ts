import { z } from "zod";

export const SourceSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    url: z.string().url(),
    publisher: z.string().min(1),
    sourceType: z.enum([
      "company",
      "news",
      "hiring",
      "security",
      "funding",
      "linkedin",
      "other",
    ]),
    publishedAt: z.string().nullable(),
  })
  .strict();

export const EvidenceSchema = z
  .object({
    id: z.string().min(1),
    sourceId: z.string().min(1),
    excerpt: z.string().min(1),
    collectedAt: z.string().datetime(),
  })
  .strict();

export const GroundedClaimSchema = z
  .object({
    text: z.string().min(1),
    evidenceIds: z.array(z.string().min(1)).min(1),
    confidence: z.enum(["high", "medium", "low"]),
  })
  .strict();

export const CompanyCandidateSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    domain: z.string().nullable(),
    websiteUrl: z.string().url().nullable(),
    description: z.string(),
    sourceIds: z.array(z.string().min(1)),
  })
  .strict();

export const CompanyResolutionSchema = z
  .object({
    researchId: z.string().uuid(),
    inputName: z.string().min(1),
    status: z.enum(["unique", "ambiguous", "not_found"]),
    candidates: z.array(CompanyCandidateSchema).max(4),
    sources: z.array(SourceSchema),
    gaps: z.array(z.string()),
  })
  .strict();

export const ResolvedCompanySchema = z
  .object({
    inputName: z.string().min(1),
    name: z.string().min(1),
    domain: z.string().min(1),
    websiteUrl: z.string().url(),
    description: z.string(),
  })
  .strict();

export const FirstPartyContextSchema = z
  .object({
    whatTheyDo: GroundedClaimSchema,
    products: z.array(GroundedClaimSchema),
    confidence: z.enum(["high", "medium", "low"]),
    gaps: z.array(z.string()),
  })
  .strict();

export const RecentSignalSchema = z
  .object({
    category: z.enum(["news", "funding", "product", "leadership"]),
    claim: GroundedClaimSchema,
  })
  .strict();

export const RecentSignalsSchema = z
  .object({
    signals: z.array(RecentSignalSchema),
    confidence: z.enum(["high", "medium", "low"]),
    gaps: z.array(z.string()),
  })
  .strict();

export const HiringSignalSchema = z
  .object({
    roleTitle: z.string().min(1),
    team: z.string().nullable(),
    location: z.string().nullable(),
    postedAt: z.string().nullable(),
    claim: GroundedClaimSchema,
  })
  .strict();

export const HiringSignalsSchema = z
  .object({
    signals: z.array(HiringSignalSchema),
    confidence: z.enum(["high", "medium", "low"]),
    gaps: z.array(z.string()),
  })
  .strict();

export const SecuritySignalSchema = z
  .object({
    category: z.enum([
      "security_team",
      "security_product",
      "compliance",
      "infrastructure",
      "incident",
      "automation",
    ]),
    claim: GroundedClaimSchema,
    whyItMatters: GroundedClaimSchema,
  })
  .strict();

export const SecuritySignalsSchema = z
  .object({
    signals: z.array(SecuritySignalSchema),
    confidence: z.enum(["high", "medium", "low"]),
    gaps: z.array(z.string()),
  })
  .strict();

export const PainPointSchema = z
  .object({
    painPoint: z.string().min(1),
    rationale: GroundedClaimSchema,
  })
  .strict();

export const TalkingPointSchema = z
  .object({
    point: z.string().min(1),
    rationale: GroundedClaimSchema,
  })
  .strict();

export const CompanyReportSchema = z
  .object({
    researchId: z.string().uuid(),
    company: ResolvedCompanySchema,
    whatTheyDo: GroundedClaimSchema,
    recentSignals: z.array(RecentSignalSchema),
    hiringSignals: z.array(HiringSignalSchema),
    securitySignals: z.array(SecuritySignalSchema),
    likelyPainPoints: z.array(PainPointSchema),
    talkingPoints: z.array(TalkingPointSchema),
    confidenceAndGaps: z.array(z.string().min(1)).min(1),
    sources: z.array(SourceSchema),
    evidence: z.array(EvidenceSchema),
  })
  .strict();

export const ResolveRequestSchema = z
  .object({
    companies: z.array(z.string()).min(1).max(5),
  })
  .strict();

export const ResolveResponseSchema = z
  .object({
    resolutions: z.array(CompanyResolutionSchema),
  })
  .strict();

export const ResearchRequestSchema = z
  .object({
    companies: z
      .array(
        z
          .object({
            researchId: z.string().uuid(),
            company: ResolvedCompanySchema,
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict();

export const ResearchFailureSchema = z
  .object({
    researchId: z.string().uuid(),
    companyName: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();

export const ResearchResponseSchema = z
  .object({
    reports: z.array(CompanyReportSchema),
    failures: z.array(ResearchFailureSchema),
  })
  .strict();

export const ResearchStageSchema = z.enum([
  "firstPartyContext",
  "recentSignals",
  "hiringSignals",
  "securitySignals",
  "synthesizeReport",
  "validateReport",
]);

export const ResearchProgressEventSchema = z
  .object({
    type: z.literal("progress"),
    timestamp: z.string().datetime(),
    sequence: z.number().int().positive(),
    batchId: z.string().uuid(),
    researchId: z.string().uuid(),
    companyName: z.string().min(1),
    stage: ResearchStageSchema,
    status: z.enum(["started", "completed", "failed"]),
    message: z.string().min(1),
    completedSteps: z.number().int().nonnegative(),
    totalSteps: z.number().int().positive(),
    durationMs: z.number().int().nonnegative().nullable(),
  })
  .strict();

export const ResearchCompleteEventSchema = z
  .object({
    type: z.literal("complete"),
    timestamp: z.string().datetime(),
    sequence: z.number().int().positive(),
    batchId: z.string().uuid(),
    response: ResearchResponseSchema,
  })
  .strict();

export const ResearchStreamErrorEventSchema = z
  .object({
    type: z.literal("error"),
    timestamp: z.string().datetime(),
    sequence: z.number().int().positive(),
    batchId: z.string().uuid(),
    message: z.string().min(1),
  })
  .strict();

export const ResearchStreamEventSchema = z.discriminatedUnion("type", [
  ResearchProgressEventSchema,
  ResearchCompleteEventSchema,
  ResearchStreamErrorEventSchema,
]);

export type Source = z.infer<typeof SourceSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type GroundedClaim = z.infer<typeof GroundedClaimSchema>;
export type CompanyCandidate = z.infer<typeof CompanyCandidateSchema>;
export type CompanyResolution = z.infer<typeof CompanyResolutionSchema>;
export type ResolvedCompany = z.infer<typeof ResolvedCompanySchema>;
export type FirstPartyContext = z.infer<typeof FirstPartyContextSchema>;
export type RecentSignal = z.infer<typeof RecentSignalSchema>;
export type RecentSignals = z.infer<typeof RecentSignalsSchema>;
export type HiringSignal = z.infer<typeof HiringSignalSchema>;
export type HiringSignals = z.infer<typeof HiringSignalsSchema>;
export type SecuritySignal = z.infer<typeof SecuritySignalSchema>;
export type SecuritySignals = z.infer<typeof SecuritySignalsSchema>;
export type CompanyReport = z.infer<typeof CompanyReportSchema>;
export type ResearchResponse = z.infer<typeof ResearchResponseSchema>;
export type ResearchStage = z.infer<typeof ResearchStageSchema>;
export type ResearchProgressEvent = z.infer<typeof ResearchProgressEventSchema>;
export type ResearchStreamEvent = z.infer<typeof ResearchStreamEventSchema>;
