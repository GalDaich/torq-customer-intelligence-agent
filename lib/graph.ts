import { ChatOpenAI } from "@langchain/openai";
import {
  END,
  START,
  StateGraph,
  StateSchema,
  type GraphNode,
} from "@langchain/langgraph";
import { z } from "zod";
import { validateGroundedReport } from "./grounding";
import { logBackend } from "./logger";
import {
  firstPartyMessages,
  hiringSignalMessages,
  recentSignalMessages,
  securitySignalMessages,
  synthesisMessages,
} from "./prompts";
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
  type CompanyReport,
  type ResearchStage,
  type ResolvedCompany,
} from "./schemas";
import {
  assertResearchEnvironment,
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
    likelyPainPoints: z.array(
      z
        .object({
          painPoint: z.string().min(1),
          rationale: GroundedClaimSchema,
        })
        .strict(),
    ),
    talkingPoints: z.array(
      z
        .object({
          point: z.string().min(1),
          rationale: GroundedClaimSchema,
        })
        .strict(),
    ),
    confidenceAndGaps: z.array(z.string().min(1)).min(1),
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
    started: "Scraping and classifying official company, product, and careers pages.",
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

async function invokeStructuredModel<T>(
  operation: string,
  researchId: string,
  companyName: string,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  logBackend({
    level: "info",
    event: "model_request_started",
    message: `OpenAI ${operation} request started.`,
    provider: "OpenAI",
    operation,
    stage: "provider",
    status: "started",
    researchId,
    companyName,
  });
  try {
    const result = await run();
    logBackend({
      level: "info",
      event: "model_request_completed",
      message: `OpenAI ${operation} request completed.`,
      provider: "OpenAI",
      operation,
      stage: "provider",
      status: "completed",
      durationMs: Date.now() - startedAt,
      researchId,
      companyName,
    });
    return result;
  } catch (error) {
    logBackend({
      level: "error",
      event: "model_request_failed",
      message: `OpenAI ${operation} request failed.`,
      provider: "OpenAI",
      operation,
      stage: "provider",
      status: "failed",
      durationMs: Date.now() - startedAt,
      researchId,
      companyName,
    });
    throw error;
  }
}

async function scrapeFirstParty(company: ResolvedCompany, researchId: string): Promise<{
  corpus: ResearchCorpus;
  gaps: string[];
}> {
  const origin = new URL(company.websiteUrl).origin;
  const targets = [
    { url: company.websiteUrl, label: "official website", sourceType: "company" as const },
    { url: new URL("/products", origin).toString(), label: "product page", sourceType: "company" as const },
    { url: new URL("/careers", origin).toString(), label: "careers page", sourceType: "hiring" as const },
  ];
  const settled = await Promise.allSettled(
    targets.map((target, index) =>
      scrapeFirecrawl({
        url: target.url,
        idPrefix: `FP${index + 1}`,
        sourceType: target.sourceType,
        logContext: { researchId, companyName: company.name },
      }),
    ),
  );
  const corpora: ResearchCorpus[] = [];
  const gaps: string[] = [];

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
  patterns: string[],
  prefix: string,
  sourceType: "news" | "hiring" | "security",
  topic: "general" | "news" = "general",
  researchId?: string,
  companyName?: string,
): Promise<{ corpus: ResearchCorpus; gaps: string[] }> {
  const settled = await Promise.allSettled(
    patterns.map((query, index) =>
      searchTavily({
        query,
        idPrefix: `${prefix}${index + 1}`,
        sourceType,
        maxResults: 4,
        topic,
        ...(topic === "news" ? { days: 365 } : {}),
        logContext: { researchId, companyName },
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
  const { corpus, gaps } = await scrapeFirstParty(state.company, state.researchId);
  if (corpus.evidence.length === 0) {
    return { firstPartyCorpus: corpus, firstPartyGaps: gaps };
  }

  try {
    const extraction = model().withStructuredOutput(FirstPartyContextSchema, {
      name: "extract_first_party_context",
      strict: true,
    });
    const firstPartyContext = await invokeStructuredModel(
      "extract_first_party_context",
      state.researchId,
      state.company.name,
      () => extraction.invoke(firstPartyMessages(state.company, corpus)),
    );
    return { firstPartyCorpus: corpus, firstPartyResult: firstPartyContext, firstPartyGaps: gaps };
  } catch {
    return {
      firstPartyCorpus: corpus,
      firstPartyGaps: [...gaps, "First-party evidence extraction failed; no finding was substituted."],
    };
  }
};

const recentSignalsNode: GraphNode<typeof ResearchState> = async (state) => {
  const { company } = state;
  const { corpus, gaps } = await searchPatterns(
    [
      `"${company.name}" recent news funding`,
      `"${company.name}" product launch announcement`,
      `"${company.name}" leadership executive appointment`,
    ],
    "REC",
    "news",
    "news",
    state.researchId,
    company.name,
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
    const recentSignals = await invokeStructuredModel(
      "extract_recent_signals",
      state.researchId,
      company.name,
      () => extraction.invoke(recentSignalMessages(company, corpus)),
    );
    return { recentCorpus: corpus, recentResult: { ...recentSignals, gaps: [...gaps, ...recentSignals.gaps] } };
  } catch {
    return {
      recentCorpus: corpus,
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
    [
      `"${company.name}" careers security engineer`,
      `"${company.name}" hiring SOC cloud security incident response`,
      `"${company.name}" engineering hiring security team`,
    ],
    "HIR",
    "hiring",
    "general",
    state.researchId,
    company.name,
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
    const hiringSignals = await invokeStructuredModel(
      "extract_hiring_signals",
      state.researchId,
      company.name,
      () => extraction.invoke(hiringSignalMessages(company, corpus)),
    );
    return { hiringCorpus: corpus, hiringResult: { ...hiringSignals, gaps: [...gaps, ...hiringSignals.gaps] } };
  } catch {
    return {
      hiringCorpus: corpus,
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
    [
      `"${company.name}" security operations SOC incident response`,
      `"${company.name}" cybersecurity cloud security compliance`,
      `"${company.name}" SIEM SOAR security automation breach vulnerability`,
    ],
    "SEC",
    "security",
    "general",
    state.researchId,
    company.name,
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
    const securitySignals = await invokeStructuredModel(
      "extract_security_signals",
      state.researchId,
      company.name,
      () => extraction.invoke(securitySignalMessages(company, corpus)),
    );
    return { securityCorpus: corpus, securityResult: { ...securitySignals, gaps: [...gaps, ...securitySignals.gaps] } };
  } catch {
    return {
      securityCorpus: corpus,
      securityResult: {
        signals: [],
        confidence: "low",
        gaps: [...gaps, "Security-signal extraction failed; no finding was substituted."],
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
  const nodeGaps = [
    ...(state.firstPartyGaps ?? []),
    ...(state.firstPartyResult?.gaps ?? []),
    ...recentSignals.gaps,
    ...hiringSignals.gaps,
    ...securitySignals.gaps,
  ];
  const synthesizer = model().withStructuredOutput(ReportContentSchema, {
    name: "synthesize_customer_intelligence_report",
    strict: true,
  });
  let content: z.infer<typeof ReportContentSchema>;
  try {
    content = await invokeStructuredModel(
      "synthesize_customer_intelligence_report",
      state.researchId,
      state.company.name,
      () => synthesizer.invoke(
        synthesisMessages({
          company: state.company,
          corpus,
          classified: {
            firstPartyContext: state.firstPartyResult,
            recentSignals,
            hiringSignals,
            securitySignals,
          },
          nodeGaps,
        }),
      ),
    );
  } catch {
    throw new ProtectedBoundaryError("LLM synthesis failed; no report was produced.");
  }

  let reportCandidate: CompanyReport;
  try {
    reportCandidate = CompanyReportSchema.parse({
      researchId: state.researchId,
      company: state.company,
      ...content,
      confidenceAndGaps: [...new Set([...nodeGaps, ...content.confidenceAndGaps])],
      sources: corpus.sources,
      evidence: corpus.evidence,
    });
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
  .addNode("synthesizeReport", withStageBoundary("synthesizeReport", synthesizeReportNode))
  .addNode("validateReport", withStageBoundary("validateReport", validateReportNode))
  .addEdge(START, "firstPartyContext")
  .addEdge(START, "recentSignals")
  .addEdge(START, "hiringSignals")
  .addEdge(START, "securitySignals")
  .addEdge(
    ["firstPartyContext", "recentSignals", "hiringSignals", "securitySignals"],
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
