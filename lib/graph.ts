import { ChatOpenAI } from "@langchain/openai";
import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
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
import { restoreGroundedReport } from "./grounding";
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
  selectRecentFirstPartyUrls,
  technologySignalSearchPlan,
  type FocusedSearchPlan,
} from "./research-plans";
import {
  createResearchWindow,
  researchWindowLabel,
  ResearchWindowSchema,
  type ResearchWindow,
} from "./research-window";
import {
  assertResearchEnvironment,
  isProviderClientError,
  mapFirecrawl,
  mergeCorpora,
  ProtectedBoundaryError,
  requireServerEnv,
  scrapeFirecrawl,
  searchTavily,
  type ResearchCorpus,
} from "./tools";

// One graph represents one confirmed company. Five specialist branches collect and
// classify evidence in parallel before a separate synthesis and deterministic validation.

export const RESEARCH_RUN_DEADLINE_MS = 240_000;
export const RESEARCH_MODEL_LIMITS = {
  specialistTimeoutMs: 60_000,
  synthesisTimeoutMs: 60_000,
  maxRetries: 0,
} as const;

const ResearchCorpusSchema = z
  .object({
    sources: z.array(SourceSchema),
    evidence: z.array(EvidenceSchema),
  })
  .strict();

const ReportContentSchema = z
  .object({
    whatTheyDo: GroundedClaimSchema.nullable(),
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
    ).max(3),
    talkingPoints: z.array(
      z
        .object({
          point: z.string().min(1),
          rationale: GroundedClaimSchema,
        })
        .strict(),
    ).max(3),
    confidenceAndGaps: z.array(z.string().min(1)).min(1).max(6),
  })
  .strict();

const ResearchState = new StateSchema({
  // Parallel nodes write to separate keys; the synthesis node is the first place their
  // evidence and gap lists are combined.
  researchId: z.string().uuid(),
  company: ResolvedCompanySchema,
  researchWindow: ResearchWindowSchema,
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

function emptyGroundedReport(
  researchId: string,
  company: ResolvedCompany,
  reason: string,
): CompanyReport {
  return CompanyReportSchema.parse({
    researchId,
    company,
    whatTheyDo: null,
    recentSignals: [],
    hiringSignals: [],
    securitySignals: [],
    technologySignals: [],
    likelyPainPoints: [],
    talkingPoints: [],
    confidenceAndGaps: [reason],
    sources: [],
    evidence: [],
  });
}

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

function model(options: { timeout?: number; maxRetries?: number } = {}) {
  return new ChatOpenAI({
    apiKey: requireServerEnv("OPENAI_API_KEY"),
    model: requireServerEnv("OPENAI_MODEL"),
    maxRetries: options.maxRetries ?? RESEARCH_MODEL_LIMITS.maxRetries,
    timeout: options.timeout ?? RESEARCH_MODEL_LIMITS.specialistTimeoutMs,
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

async function scrapeFirstParty(
  company: ResolvedCompany,
  researchWindow: ResearchWindow,
  signal?: AbortSignal,
): Promise<{
  corpus: ResearchCorpus;
  gaps: string[];
}> {
  // The confirmed origin is always scraped; mapping may add at most two focused company,
  // product, platform, solution, or about pages from the same host.
  const origin = new URL(company.websiteUrl).origin;
  const officialHost = new URL(origin).hostname.replace(/^www\./, "");
  const gaps: string[] = [];
  let mappedLinks: Awaited<ReturnType<typeof mapFirecrawl>> = [];
  try {
    mappedLinks = await mapFirecrawl({
      url: origin,
      search: "company overview products platform solutions about",
      limit: 5,
      signal,
    });
  } catch (error) {
    throwIfAborted(signal);
    if (isProviderClientError(error)) {
      throw error;
    }
    gaps.push("The official site map could not be read; first-party research used the homepage only.");
  }

  const blockedPath = /\/(blog|news|press|careers?|jobs?|events?|resources?|privacy|terms|legal|login|contact|demo)(\/|$)/i;
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
        researchWindow,
        freshnessPolicy: "current_state",
        companyDomain: company.domain,
        signal,
      }),
    ),
  );
  throwIfAborted(signal);
  const corpora: ResearchCorpus[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value.evidence.length > 0) {
      corpora.push(result.value);
    } else if (
      result.status === "rejected" &&
      isProviderClientError(result.reason)
    ) {
      throw result.reason;
    } else {
      gaps.push(
        `The ${targets[index].label} did not yield usable current first-party evidence.`,
      );
    }
  });

  return { corpus: mergeCorpora(corpora), gaps };
}

async function scrapeRecentFirstParty(
  company: ResolvedCompany,
  researchWindow: ResearchWindow,
  signal?: AbortSignal,
): Promise<{ corpus: ResearchCorpus; gaps: string[] }> {
  // Tavily searches the wider web, while this bounded fallback explicitly checks the
  // confirmed company's blog, newsroom, and press-release sections for original items.
  const origin = new URL(company.websiteUrl).origin;
  const gaps: string[] = [];
  let mappedLinks: Awaited<ReturnType<typeof mapFirecrawl>> = [];

  try {
    mappedLinks = await mapFirecrawl({
      url: origin,
      search:
        "recent blog news newsroom press release announcement product launch funding acquisition partnership leadership",
      limit: 8,
      includeSubdomains: true,
      signal,
    });
  } catch (error) {
    throwIfAborted(signal);
    if (isProviderClientError(error)) throw error;
    return {
      corpus: { sources: [], evidence: [] },
      gaps: ["The official blog and newsroom could not be mapped for recent items."],
    };
  }

  const targetUrls = selectRecentFirstPartyUrls(mappedLinks, company);

  if (targetUrls.length === 0) {
    return {
      corpus: { sources: [], evidence: [] },
      gaps: ["No item-specific company blog, newsroom, or press-release page was discovered."],
    };
  }

  const settled = await Promise.allSettled(
    targetUrls.map((url, index) =>
      scrapeFirecrawl({
        url,
        idPrefix: `RFP${index + 1}`,
        sourceType: "news",
        researchWindow,
        freshnessPolicy: "dated_event",
        signal,
      }),
    ),
  );
  throwIfAborted(signal);
  const corpora: ResearchCorpus[] = [];
  settled.forEach((result) => {
    if (result.status === "fulfilled" && result.value.evidence.length > 0) {
      corpora.push(result.value);
    } else if (result.status === "rejected" && isProviderClientError(result.reason)) {
      throw result.reason;
    }
  });

  if (corpora.length === 0) {
    gaps.push(
      `The discovered company blog and press items had no usable publication date from ${researchWindowLabel(researchWindow)}.`,
    );
  }
  return { corpus: mergeCorpora(corpora), gaps };
}

async function searchPatterns(
  patterns: FocusedSearchPlan[],
  prefix: string,
  sourceType: "news" | "hiring" | "security" | "technology",
  signal?: AbortSignal,
): Promise<{ corpus: ResearchCorpus; gaps: string[] }> {
  // Search calls within a specialist run together. Expected server/network failures become
  // gaps, while provider 4xx responses remain blocking because the request was rejected.
  const settled = await Promise.allSettled(
    patterns.map((pattern, index) =>
      searchTavily({
        ...pattern,
        idPrefix: `${prefix}${index + 1}`,
        sourceType,
        signal,
      }),
    ),
  );
  throwIfAborted(signal);
  const corpora: ResearchCorpus[] = [];
  const gaps: string[] = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") corpora.push(result.value);
    else if (
      isProviderClientError(result.reason)
    ) {
      throw result.reason;
    }
    else gaps.push(`Focused ${sourceType} search ${index + 1} failed.`);
  });

  return { corpus: mergeCorpora(corpora), gaps };
}

const firstPartyContextNode: GraphNode<typeof ResearchState> = async (state, config) => {
  const { corpus, gaps } = await scrapeFirstParty(
    state.company,
    state.researchWindow,
    config?.signal,
  );
  if (corpus.evidence.length === 0) {
    return { firstPartyCorpus: corpus, firstPartyGaps: gaps };
  }

  try {
    const extraction = model().withStructuredOutput(FirstPartyContextSchema, {
      name: "extract_first_party_context",
      strict: true,
    });
    const firstPartyContext = await extraction.invoke(
      firstPartyMessages(state.company, corpus, state.researchWindow),
      config,
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
  } catch (error) {
    throwIfAborted(config?.signal);
    if (isProviderClientError(error)) throw error;
    return {
      firstPartyCorpus: { sources: [], evidence: [] },
      firstPartyGaps: [...gaps, "First-party evidence extraction failed; no finding was substituted."],
    };
  }
};

const recentSignalsNode: GraphNode<typeof ResearchState> = async (state, config) => {
  const { company } = state;
  const [searched, firstParty] = await Promise.all([
    searchPatterns(
      recentSignalSearchPlan(company, state.researchWindow),
      "REC",
      "news",
      config?.signal,
    ),
    scrapeRecentFirstParty(company, state.researchWindow, config?.signal),
  ]);
  const corpus = mergeCorpora([searched.corpus, firstParty.corpus]);
  const gaps = [...searched.gaps, ...firstParty.gaps];
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
    const recentSignals = await extraction.invoke(
      recentSignalMessages(company, corpus, state.researchWindow),
      config,
    );
    const selectedCorpus = retainEvidenceForClaims(
      corpus,
      recentSignals.signals.map((signal) => signal.claim),
    );
    return {
      recentCorpus: selectedCorpus,
      recentResult: { ...recentSignals, gaps: [...gaps, ...recentSignals.gaps] },
    };
  } catch (error) {
    throwIfAborted(config?.signal);
    if (isProviderClientError(error)) throw error;
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

const hiringSignalsNode: GraphNode<typeof ResearchState> = async (state, config) => {
  const { company } = state;
  const { corpus, gaps } = await searchPatterns(
    hiringSignalSearchPlan(company, state.researchWindow),
    "HIR",
    "hiring",
    config?.signal,
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
    const hiringSignals = await extraction.invoke(
      hiringSignalMessages(company, corpus, state.researchWindow),
      config,
    );
    const selectedCorpus = retainStrongHiringEvidence(corpus, hiringSignals.signals);
    return {
      hiringCorpus: selectedCorpus,
      hiringResult: { ...hiringSignals, gaps: [...gaps, ...hiringSignals.gaps] },
    };
  } catch (error) {
    throwIfAborted(config?.signal);
    if (isProviderClientError(error)) throw error;
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

const securitySignalsNode: GraphNode<typeof ResearchState> = async (state, config) => {
  const { company } = state;
  const { corpus, gaps } = await searchPatterns(
    securitySignalSearchPlan(company, state.researchWindow),
    "SEC",
    "security",
    config?.signal,
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
    const securitySignals = await extraction.invoke(
      securitySignalMessages(company, corpus, state.researchWindow),
      config,
    );
    const selectedCorpus = retainEvidenceForClaims(
      corpus,
      securitySignals.signals.flatMap((signal) => [signal.claim, signal.whyItMatters]),
    );
    return {
      securityCorpus: selectedCorpus,
      securityResult: { ...securitySignals, gaps: [...gaps, ...securitySignals.gaps] },
    };
  } catch (error) {
    throwIfAborted(config?.signal);
    if (isProviderClientError(error)) throw error;
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

const technologySignalsNode: GraphNode<typeof ResearchState> = async (state, config) => {
  const { company } = state;
  const { corpus, gaps } = await searchPatterns(
    technologySignalSearchPlan(company, state.researchWindow),
    "TEC",
    "technology",
    config?.signal,
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
    const technologySignals = await extraction.invoke(
      technologySignalMessages(company, corpus, state.researchWindow),
      config,
    );
    const selectedCorpus = retainStrongTechnologyEvidence(corpus, technologySignals.signals);
    return {
      technologyCorpus: selectedCorpus,
      technologyResult: { ...technologySignals, gaps: [...gaps, ...technologySignals.gaps] },
    };
  } catch (error) {
    throwIfAborted(config?.signal);
    if (isProviderClientError(error)) throw error;
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

const synthesizeReportNode: GraphNode<typeof ResearchState> = async (state, config) => {
  // Synthesis sees only evidence retained by the specialist classifiers, never the full
  // raw result set returned by Tavily or Firecrawl.
  const corpus = mergeCorpora([
    state.firstPartyCorpus ?? { sources: [], evidence: [] },
    state.recentCorpus ?? { sources: [], evidence: [] },
    state.hiringCorpus ?? { sources: [], evidence: [] },
    state.securityCorpus ?? { sources: [], evidence: [] },
    state.technologyCorpus ?? { sources: [], evidence: [] },
  ]);
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

  const partialReport = (reason: string): CompanyReport => {
    try {
      return restoreGroundedReport({
        researchId: state.researchId,
        company: state.company,
        whatTheyDo: state.firstPartyResult?.whatTheyDo ?? null,
        recentSignals: recentSignals.signals,
        hiringSignals: hiringSignals.signals,
        securitySignals: securitySignals.signals,
        technologySignals: technologySignals.signals,
        likelyPainPoints: [],
        talkingPoints: [],
        confidenceAndGaps: [...new Set([...nodeGaps, reason])].slice(0, 6),
        sources: corpus.sources,
        evidence: corpus.evidence,
      }, state.researchWindow);
    } catch {
      return emptyGroundedReport(
        state.researchId,
        state.company,
        `${reason} Collected findings could not be safely retained.`,
      );
    }
  };

  if (corpus.evidence.length === 0) {
    return {
      reportCandidate: partialReport(
        "No usable public evidence was collected; the report is intentionally empty rather than fabricated.",
      ),
    };
  }
  const synthesizer = model({
    timeout: RESEARCH_MODEL_LIMITS.synthesisTimeoutMs,
    maxRetries: RESEARCH_MODEL_LIMITS.maxRetries,
  }).withStructuredOutput(ReportContentSchema, {
    name: "synthesize_customer_intelligence_report",
    strict: true,
  });
  let content: z.infer<typeof ReportContentSchema>;
  try {
    content = await synthesizer.invoke(
      synthesisMessages({
        company: state.company,
        researchWindow: state.researchWindow,
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
      config,
    );
  } catch (error) {
    throwIfAborted(config?.signal);
    if (isProviderClientError(error)) throw error;
    return {
      reportCandidate: partialReport(
        "Final synthesis failed; grounded specialist findings are shown without synthesized pain points or talking points.",
      ),
    };
  }

  let reportCandidate: CompanyReport;
  try {
    reportCandidate = CompanyReportSchema.parse({
      researchId: state.researchId,
      company: state.company,
      ...content,
      confidenceAndGaps: content.confidenceAndGaps,
      sources: corpus.sources,
      evidence: corpus.evidence,
    });
  } catch {
    return {
      reportCandidate: partialReport(
        "The synthesized report contract was invalid; grounded specialist findings are shown instead.",
      ),
    };
  }
  return { reportCandidate };
};

const validateReportNode: GraphNode<typeof ResearchState> = (state) => {
  if (!state.reportCandidate) throw new Error("Report synthesis did not produce a candidate.");
  try {
    return {
      report: restoreGroundedReport(state.reportCandidate, state.researchWindow),
    };
  } catch {
    return {
      report: emptyGroundedReport(
        state.researchId,
        state.company,
        "The collected findings could not be safely grounded and were omitted from this partial report.",
      ),
    };
  }
};

export const researchGraph = new StateGraph({ state: ResearchState, output: ResearchOutput })
  // Fan out after START, join all five specialists at synthesis, then validate once.
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
  externalSignal?: AbortSignal,
): Promise<CompanyReport> {
  assertResearchEnvironment();
  const researchWindow = createResearchWindow();
  const startedAt = new Map<ResearchStage, number>();
  const deadlineController = new AbortController();
  const deadlineTimer = setTimeout(() => {
    deadlineController.abort(
      new ProtectedBoundaryError(
        "Research reached its four-minute safety deadline; completed companies and stages remain visible.",
      ),
    );
  }, RESEARCH_RUN_DEADLINE_MS);
  deadlineTimer.unref();
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, deadlineController.signal])
    : deadlineController.signal;
  let report: CompanyReport | undefined;

  try {
    const stream = await researchGraph.stream(
      { researchId, company, researchWindow },
      {
        configurable: { thread_id: researchId },
        metadata: {
          researchId,
          companyName: company.name,
          domain: company.domain,
        },
        tags: ["customer-intelligence", `research:${researchId}`],
        streamMode: "tasks",
        signal,
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
  } finally {
    clearTimeout(deadlineTimer);
    // Root graph completion is the last trace update. Drain callbacks before Vercel can
    // suspend the function so completed and failed runs never remain falsely pending.
    await awaitAllCallbacks();
  }

  if (!report) throw new Error("Research graph completed without a validated report.");
  return report;
}
