import { ChatOpenAI } from "@langchain/openai";
import {
  END,
  START,
  StateGraph,
  StateSchema,
  type GraphNode,
} from "@langchain/langgraph";
import { z } from "zod";
import { firstPartyMessages } from "../prompts/first-party-context";
import { hiringSignalMessages } from "../prompts/hiring-signals";
import { recentSignalMessages } from "../prompts/recent-signals";
import { synthesisMessages } from "../prompts/report-synthesis";
import { securitySignalMessages } from "../prompts/security-signals";
import { technologySignalMessages } from "../prompts/technology-signals";
import {
  retainEvidenceForClaims,
  retainStrongHiringEvidence,
  retainStrongTechnologyEvidence,
} from "./evidence-quality";
import { retainCitedLineage, validateGroundedReport } from "./grounding";
import {
  CompanyReportSchema,
  EvidenceSchema,
  FirstPartyContextSchema,
  GroundedClaimSchema,
  HiringSignalsSchema,
  RecentSignalSchema,
  RecentSignalsSchema,
  ResolvedCompanySchema,
  SecuritySignalSchema,
  SecuritySignalsSchema,
  SourceSchema,
  TechnologySignalsSchema,
  type CompanyReport,
  type ResearchStage,
  type ResolvedCompany,
} from "./schemas";
import {
  hiringSignalSearchPlan,
  recentSignalSearchPlan,
  securitySignalSearchPlan,
  technologySignalSearchPlan,
  type FocusedSearchPlan,
} from "./research-plans";
import {
  assertResearchEnvironment,
  mapFirecrawl,
  mergeCorpora,
  ProtectedBoundaryError,
  ProviderError,
  requireServerEnv,
  scrapeFirecrawl,
  searchTavily,
  type ResearchCorpus,
} from "./tools";

const ResearchCorpusSchema = z
  .object({
    sources: z.array(SourceSchema),
    evidence: z.array(EvidenceSchema),
  })
  .strict();

const ReportContentSchema = z
  .object({
    whatTheyDo: GroundedClaimSchema,
    recentSignals: z.array(RecentSignalSchema),
    hiringSignals: HiringSignalsSchema.shape.signals,
    securitySignals: z.array(SecuritySignalSchema),
    technologySignals: TechnologySignalsSchema.shape.signals,
    likelyPainPoints: z.array(
      z
        .object({
          painPoint: z.string().min(1),
          rationale: GroundedClaimSchema,
        })
        .strict(),
    ).min(1).max(3),
    talkingPoints: z.array(
      z
        .object({
          point: z.string().min(1),
          rationale: GroundedClaimSchema,
        })
        .strict(),
    ).min(2).max(3),
    confidenceAndGaps: z.array(z.string().min(1)).min(1).max(6),
  })
  .strict();

const ResearchState = new StateSchema({
  researchId: z.string().uuid(),
  company: ResolvedCompanySchema,
  firstPartyCorpus: ResearchCorpusSchema.optional(),
  firstPartyResult: FirstPartyContextSchema.optional(),
  firstPartyGaps: z.array(z.string()).optional(),
  recentCorpus: ResearchCorpusSchema.optional(),
  recentResult: RecentSignalsSchema.optional(),
  hiringCorpus: ResearchCorpusSchema.optional(),
  hiringResult: HiringSignalsSchema.optional(),
  securityCorpus: ResearchCorpusSchema.optional(),
  securityResult: SecuritySignalsSchema.optional(),
  technologyCorpus: ResearchCorpusSchema.optional(),
  technologyResult: TechnologySignalsSchema.optional(),
  reportCandidate: CompanyReportSchema.optional(),
  report: CompanyReportSchema.optional(),
});

const ResearchOutput = new StateSchema({
  report: CompanyReportSchema.optional(),
});

export type ResearchProgressUpdate = {
  stage: ResearchStage;
  status: "started" | "completed" | "failed";
  message: string;
  durationMs: number | null;
};

const STAGE_MESSAGES: Record<
  ResearchStage,
  { started: string; completed: string; failed: string }
> = {
  firstPartyContext: {
    started: "Scraping and classifying official company and product pages.",
    completed: "First-party research completed.",
    failed: "First-party research failed.",
  },
  recentSignals: {
    started: "Researching and classifying recent news, funding, product, and leadership signals.",
    completed: "Recent-signal research completed.",
    failed: "Recent-signal research failed.",
  },
  hiringSignals: {
    started: "Researching and classifying security and engineering hiring signals.",
    completed: "Hiring-signal research completed.",
    failed: "Hiring-signal research failed.",
  },
  securitySignals: {
    started: "Researching and classifying security operations, compliance, and incident signals.",
    completed: "Security-signal research completed.",
    failed: "Security-signal research failed.",
  },
  technologySignals: {
    started: "Researching named security, cloud, identity, and workflow technologies.",
    completed: "Technology-stack research completed.",
    failed: "Technology-stack research failed.",
  },
  synthesizeReport: {
    started: "Synthesizing evidence into the customer intelligence report.",
    completed: "Report synthesis completed.",
    failed: "Report synthesis failed.",
  },
  validateReport: {
    started: "Validating every claim, evidence ID, source ID, and URL.",
    completed: "Grounding validation completed.",
    failed: "Grounding validation failed.",
  },
};

class ResearchStageError extends Error {
  readonly stage: ResearchStage;
  readonly originalError: unknown;

  constructor(stage: ResearchStage, originalError: unknown) {
    super(`Research stage failed: ${stage}.`);
    this.name = "ResearchStageError";
    this.stage = stage;
    this.originalError = originalError;
  }
}

function withStageBoundary(
  stage: ResearchStage,
  node: GraphNode<typeof ResearchState>,
): GraphNode<typeof ResearchState> {
  return async (state, config) => {
    try {
      return await node(state, config);
    } catch (error) {
      throw new ResearchStageError(stage, error);
    }
  };
}

function model() {
  return new ChatOpenAI({
    apiKey: requireServerEnv("OPENAI_API_KEY"),
    model: requireServerEnv("OPENAI_MODEL"),
    maxRetries: 1,
    timeout: 90_000,
  });
}

async function scrapeFirstParty(company: ResolvedCompany): Promise<{
  corpus: ResearchCorpus;
  gaps: string[];
}> {
  const origin = new URL(company.websiteUrl).origin;
  const gaps: string[] = [];
  let mappedLinks: Awaited<ReturnType<typeof mapFirecrawl>> = [];
  try {
    mappedLinks = await mapFirecrawl({
      url: origin,
      search: "company overview products platform solutions about",
      limit: 10,
    });
  } catch (error) {
    if (
      error instanceof ProviderError &&
      (error.status === 401 || error.status === 403)
    ) {
      throw error;
    }
    gaps.push("The official site map could not be read; first-party research used the homepage only.");
  }

  const blockedPath = /\/(blog|news|press|careers?|jobs?|events?|resources?|privacy|terms|legal|login|contact|demo)(\/|$)/i;
  const officialHost = new URL(origin).hostname.replace(/^www\./, "");
  const targetUrls = [
    origin,
    ...mappedLinks
      .map((link) => link.url)
      .filter((url) => {
        const parsed = new URL(url);
        return parsed.hostname.replace(/^www\./, "") === officialHost &&
          parsed.pathname !== "/" &&
          !blockedPath.test(parsed.pathname);
      }),
  ].filter((url, index, values) => values.indexOf(url) === index).slice(0, 3);
  const targets = targetUrls.map((url, index) => ({
    url,
    label: index === 0 ? "official homepage" : "mapped first-party page",
    sourceType: "company" as const,
  }));
  const settled = await Promise.allSettled(
    targets.map((target, index) =>
      scrapeFirecrawl({
        url: target.url,
        idPrefix: `FP${index + 1}`,
        sourceType: target.sourceType,
      }),
    ),
  );
  const corpora: ResearchCorpus[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value.evidence.length > 0) {
      corpora.push(result.value);
    } else if (
      result.status === "rejected" &&
      result.reason instanceof ProviderError &&
      (result.reason.status === 401 || result.reason.status === 403)
    ) {
      throw result.reason;
    } else {
      gaps.push(`The ${targets[index].label} did not yield usable first-party evidence.`);
    }
  });

  return { corpus: mergeCorpora(corpora), gaps };
}

async function searchPatterns(
  patterns: FocusedSearchPlan[],
  prefix: string,
  sourceType: "news" | "hiring" | "security" | "technology",
): Promise<{ corpus: ResearchCorpus; gaps: string[] }> {
  const settled = await Promise.allSettled(
    patterns.map((pattern, index) =>
      searchTavily({
        ...pattern,
        idPrefix: `${prefix}${index + 1}`,
        sourceType,
      }),
    ),
  );
  const corpora: ResearchCorpus[] = [];
  const gaps: string[] = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") corpora.push(result.value);
    else if (
      result.reason instanceof ProviderError &&
      (result.reason.status === 401 || result.reason.status === 403)
    ) {
      throw result.reason;
    }
    else gaps.push(`Focused ${sourceType} search ${index + 1} failed.`);
  });

  return { corpus: mergeCorpora(corpora), gaps };
}

const firstPartyContextNode: GraphNode<typeof ResearchState> = async (state) => {
  const { corpus, gaps } = await scrapeFirstParty(state.company);
  if (corpus.evidence.length === 0) {
    return { firstPartyCorpus: corpus, firstPartyGaps: gaps };
  }

  try {
    const extraction = model().withStructuredOutput(FirstPartyContextSchema, {
      name: "extract_first_party_context",
      strict: true,
    });
    const firstPartyContext = await extraction.invoke(
      firstPartyMessages(state.company, corpus),
    );
    const selectedCorpus = retainEvidenceForClaims(
      corpus,
      [firstPartyContext.whatTheyDo, ...firstPartyContext.products],
    );
    return {
      firstPartyCorpus: selectedCorpus,
      firstPartyResult: firstPartyContext,
      firstPartyGaps: gaps,
    };
  } catch {
    return {
      firstPartyCorpus: { sources: [], evidence: [] },
      firstPartyGaps: [...gaps, "First-party evidence extraction failed; no finding was substituted."],
    };
  }
};

const recentSignalsNode: GraphNode<typeof ResearchState> = async (state) => {
  const { company } = state;
  const { corpus, gaps } = await searchPatterns(
    recentSignalSearchPlan(company),
    "REC",
    "news",
  );
  if (corpus.evidence.length === 0) {
    return {
      recentCorpus: corpus,
      recentResult: { signals: [], confidence: "low", gaps: [...gaps, "No recent evidence was found."] },
    };
  }

  try {
    const extraction = model().withStructuredOutput(RecentSignalsSchema, {
      name: "extract_recent_signals",
      strict: true,
    });
    const recentSignals = await extraction.invoke(recentSignalMessages(company, corpus));
    const selectedCorpus = retainEvidenceForClaims(
      corpus,
      recentSignals.signals.map((signal) => signal.claim),
    );
    return {
      recentCorpus: selectedCorpus,
      recentResult: { ...recentSignals, gaps: [...gaps, ...recentSignals.gaps] },
    };
  } catch {
    return {
      recentCorpus: { sources: [], evidence: [] },
      recentResult: {
        signals: [],
        confidence: "low",
        gaps: [...gaps, "Recent-signal extraction failed; no finding was substituted."],
      },
    };
  }
};

const hiringSignalsNode: GraphNode<typeof ResearchState> = async (state) => {
  const { company } = state;
  const { corpus, gaps } = await searchPatterns(
    hiringSignalSearchPlan(company),
    "HIR",
    "hiring",
  );
  if (corpus.evidence.length === 0) {
    return {
      hiringCorpus: corpus,
      hiringResult: { signals: [], confidence: "low", gaps: [...gaps, "No hiring evidence was found."] },
    };
  }

  try {
    const extraction = model().withStructuredOutput(HiringSignalsSchema, {
      name: "extract_hiring_signals",
      strict: true,
    });
    const hiringSignals = await extraction.invoke(hiringSignalMessages(company, corpus));
    const selectedCorpus = retainStrongHiringEvidence(corpus, hiringSignals.signals);
    return {
      hiringCorpus: selectedCorpus,
      hiringResult: { ...hiringSignals, gaps: [...gaps, ...hiringSignals.gaps] },
    };
  } catch {
    return {
      hiringCorpus: { sources: [], evidence: [] },
      hiringResult: {
        signals: [],
        confidence: "low",
        gaps: [...gaps, "Hiring-signal extraction failed; no finding was substituted."],
      },
    };
  }
};

const securitySignalsNode: GraphNode<typeof ResearchState> = async (state) => {
  const { company } = state;
  const { corpus, gaps } = await searchPatterns(
    securitySignalSearchPlan(company),
    "SEC",
    "security",
  );
  if (corpus.evidence.length === 0) {
    return {
      securityCorpus: corpus,
      securityResult: { signals: [], confidence: "low", gaps: [...gaps, "No security evidence was found."] },
    };
  }

  try {
    const extraction = model().withStructuredOutput(SecuritySignalsSchema, {
      name: "extract_security_signals",
      strict: true,
    });
    const securitySignals = await extraction.invoke(securitySignalMessages(company, corpus));
    const selectedCorpus = retainEvidenceForClaims(
      corpus,
      securitySignals.signals.flatMap((signal) => [signal.claim, signal.whyItMatters]),
    );
    return {
      securityCorpus: selectedCorpus,
      securityResult: { ...securitySignals, gaps: [...gaps, ...securitySignals.gaps] },
    };
  } catch {
    return {
      securityCorpus: { sources: [], evidence: [] },
      securityResult: {
        signals: [],
        confidence: "low",
        gaps: [...gaps, "Security-signal extraction failed; no finding was substituted."],
      },
    };
  }
};

const technologySignalsNode: GraphNode<typeof ResearchState> = async (state) => {
  const { company } = state;
  const { corpus, gaps } = await searchPatterns(
    technologySignalSearchPlan(company),
    "TEC",
    "technology",
  );
  if (corpus.evidence.length === 0) {
    return {
      technologyCorpus: corpus,
      technologyResult: {
        signals: [],
        confidence: "low",
        gaps: [...gaps, "No specific technology-stack evidence was found."],
      },
    };
  }

  try {
    const extraction = model().withStructuredOutput(TechnologySignalsSchema, {
      name: "extract_technology_signals",
      strict: true,
    });
    const technologySignals = await extraction.invoke(technologySignalMessages(company, corpus));
    const selectedCorpus = retainStrongTechnologyEvidence(corpus, technologySignals.signals);
    return {
      technologyCorpus: selectedCorpus,
      technologyResult: { ...technologySignals, gaps: [...gaps, ...technologySignals.gaps] },
    };
  } catch {
    return {
      technologyCorpus: { sources: [], evidence: [] },
      technologyResult: {
        signals: [],
        confidence: "low",
        gaps: [...gaps, "Technology-stack extraction failed; no finding was substituted."],
      },
    };
  }
};

const synthesizeReportNode: GraphNode<typeof ResearchState> = async (state) => {
  const corpus = mergeCorpora([
    state.firstPartyCorpus ?? { sources: [], evidence: [] },
    state.recentCorpus ?? { sources: [], evidence: [] },
    state.hiringCorpus ?? { sources: [], evidence: [] },
    state.securityCorpus ?? { sources: [], evidence: [] },
    state.technologyCorpus ?? { sources: [], evidence: [] },
  ]);
  if (corpus.evidence.length === 0) {
    throw new ProtectedBoundaryError(
      "No usable public evidence was collected; no report was fabricated.",
    );
  }

  const recentSignals = state.recentResult ?? {
    signals: [],
    confidence: "low" as const,
    gaps: ["Recent-signal research did not complete."],
  };
  const hiringSignals = state.hiringResult ?? {
    signals: [],
    confidence: "low" as const,
    gaps: ["Hiring-signal research did not complete."],
  };
  const securitySignals = state.securityResult ?? {
    signals: [],
    confidence: "low" as const,
    gaps: ["Security-signal research did not complete."],
  };
  const technologySignals = state.technologyResult ?? {
    signals: [],
    confidence: "low" as const,
    gaps: ["Technology-stack research did not complete."],
  };
  const nodeGaps = [
    ...(state.firstPartyGaps ?? []),
    ...(state.firstPartyResult?.gaps ?? []),
    ...recentSignals.gaps,
    ...hiringSignals.gaps,
    ...securitySignals.gaps,
    ...technologySignals.gaps,
  ];
  const synthesizer = model().withStructuredOutput(ReportContentSchema, {
    name: "synthesize_customer_intelligence_report",
    strict: true,
  });
  let content: z.infer<typeof ReportContentSchema>;
  try {
    content = await synthesizer.invoke(
      synthesisMessages({
        company: state.company,
        corpus,
        classified: {
          firstPartyContext: state.firstPartyResult,
          recentSignals,
          hiringSignals,
          securitySignals,
          technologySignals,
        },
        nodeGaps,
      }),
    );
  } catch {
    throw new ProtectedBoundaryError("LLM synthesis failed; no report was produced.");
  }

  let reportCandidate: CompanyReport;
  try {
    reportCandidate = retainCitedLineage(
      CompanyReportSchema.parse({
        researchId: state.researchId,
        company: state.company,
        ...content,
        confidenceAndGaps: content.confidenceAndGaps,
        sources: corpus.sources,
        evidence: corpus.evidence,
      }),
    );
  } catch {
    throw new ProtectedBoundaryError(
      "Grounding validation rejected an invalid report contract.",
    );
  }
  return { reportCandidate };
};

const validateReportNode: GraphNode<typeof ResearchState> = (state) => {
  if (!state.reportCandidate) throw new Error("Report synthesis did not produce a candidate.");
  try {
    return { report: validateGroundedReport(state.reportCandidate) };
  } catch {
    throw new ProtectedBoundaryError(
      "Grounding validation rejected unsupported report claims.",
    );
  }
};

export const researchGraph = new StateGraph({ state: ResearchState, output: ResearchOutput })
  .addNode("firstPartyContext", withStageBoundary("firstPartyContext", firstPartyContextNode))
  .addNode("recentSignals", withStageBoundary("recentSignals", recentSignalsNode))
  .addNode("hiringSignals", withStageBoundary("hiringSignals", hiringSignalsNode))
  .addNode("securitySignals", withStageBoundary("securitySignals", securitySignalsNode))
  .addNode("technologySignals", withStageBoundary("technologySignals", technologySignalsNode))
  .addNode("synthesizeReport", withStageBoundary("synthesizeReport", synthesizeReportNode))
  .addNode("validateReport", withStageBoundary("validateReport", validateReportNode))
  .addEdge(START, "firstPartyContext")
  .addEdge(START, "recentSignals")
  .addEdge(START, "hiringSignals")
  .addEdge(START, "securitySignals")
  .addEdge(START, "technologySignals")
  .addEdge(
    [
      "firstPartyContext",
      "recentSignals",
      "hiringSignals",
      "securitySignals",
      "technologySignals",
    ],
    "synthesizeReport",
  )
  .addEdge("synthesizeReport", "validateReport")
  .addEdge("validateReport", END)
  .compile();

export function hasCompletedTaskOutput(result: unknown): boolean {
  return typeof result === "object" && result !== null && Object.keys(result).length > 0;
}

export async function runCompanyResearch(
  researchId: string,
  company: ResolvedCompany,
  onProgress?: (update: ResearchProgressUpdate) => void | Promise<void>,
): Promise<CompanyReport> {
  assertResearchEnvironment();
  const startedAt = new Map<ResearchStage, number>();
  let report: CompanyReport | undefined;

  try {
    const stream = await researchGraph.stream(
      { researchId, company },
      {
        configurable: { thread_id: researchId },
        metadata: {
          researchId,
          companyName: company.name,
          domain: company.domain,
        },
        tags: ["customer-intelligence", `research:${researchId}`],
        streamMode: "tasks",
      },
    );

    for await (const event of stream) {
      const stage = event.name as ResearchStage;
      if (!(stage in STAGE_MESSAGES)) continue;

      if (!("result" in event)) {
        startedAt.set(stage, Date.now());
        await onProgress?.({
          stage,
          status: "started",
          message: STAGE_MESSAGES[stage].started,
          durationMs: null,
        });
        continue;
      }

      // LangGraph emits an empty task result before rethrowing a node error.
      // Only node output with state updates represents a completed stage.
      if (!hasCompletedTaskOutput(event.result)) continue;
      const durationMs = Math.max(0, Date.now() - (startedAt.get(stage) ?? Date.now()));
      await onProgress?.({
        stage,
        status: "completed",
        message: STAGE_MESSAGES[stage].completed,
        durationMs,
      });
      if (stage === "validateReport") {
        const result = event.result as { report?: CompanyReport };
        report = result.report;
      }
    }
  } catch (error) {
    if (error instanceof ResearchStageError) {
      const durationMs = Math.max(
        0,
        Date.now() - (startedAt.get(error.stage) ?? Date.now()),
      );
      await onProgress?.({
        stage: error.stage,
        status: "failed",
        message: STAGE_MESSAGES[error.stage].failed,
        durationMs,
      });
      throw error.originalError;
    }
    throw error;
  }

  if (!report) throw new Error("Research graph completed without a validated report.");
  return report;
}
