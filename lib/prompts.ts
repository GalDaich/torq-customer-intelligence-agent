import type {
  FirstPartyContext,
  HiringSignals,
  RecentSignals,
  ResolvedCompany,
  SecuritySignals,
} from "./schemas";
import type { ResearchCorpus } from "./tools";

const GROUNDING_RULES = `
You analyze only the supplied sources and immutable evidence records.
- Never create, alter, or guess an evidence ID, source, URL, title, excerpt, date, role, or company fact.
- Every claim must cite one or more supplied evidence IDs that directly support the text.
- Pain points and talking points are labeled inferences and still require supporting evidence IDs.
- Omit a claim when support is weak; record the limitation in gaps instead.
- Missing dates and details stay unknown.
`.trim();

function evidencePayload(company: ResolvedCompany, corpus: ResearchCorpus): string {
  return JSON.stringify(
    {
      company,
      sources: corpus.sources,
      evidence: corpus.evidence,
    },
    null,
    2,
  );
}

export function firstPartyMessages(company: ResolvedCompany, corpus: ResearchCorpus) {
  return [
    {
      role: "system" as const,
      content: `${GROUNDING_RULES}\nClassify first-party evidence into a concise company description and products.`,
    },
    {
      role: "user" as const,
      content: `Extract only what the company itself supports.\n\n${evidencePayload(company, corpus)}`,
    },
  ];
}

export function recentSignalMessages(company: ResolvedCompany, corpus: ResearchCorpus) {
  return [
    {
      role: "system" as const,
      content: `${GROUNDING_RULES}\nClassify current evidence into news, funding, product, or leadership signals.`,
    },
    {
      role: "user" as const,
      content: `Return only concrete recent signals.\n\n${evidencePayload(company, corpus)}`,
    },
  ];
}

export function hiringSignalMessages(company: ResolvedCompany, corpus: ResearchCorpus) {
  return [
    {
      role: "system" as const,
      content: `${GROUNDING_RULES}\nClassify actual open security, SOC, cloud-security, incident-response, and security-engineering roles.`,
    },
    {
      role: "user" as const,
      content: `Do not turn a generic careers page into an open role.\n\n${evidencePayload(company, corpus)}`,
    },
  ];
}

export function securitySignalMessages(company: ResolvedCompany, corpus: ResearchCorpus) {
  return [
    {
      role: "system" as const,
      content: `${GROUNDING_RULES}\nClassify explicit security, compliance, infrastructure, incident, and automation evidence. Keep operational complexity clearly inferential.`,
    },
    {
      role: "user" as const,
      content: `Explain why each supported signal matters to a security-automation conversation.\n\n${evidencePayload(company, corpus)}`,
    },
  ];
}

export function synthesisMessages(input: {
  company: ResolvedCompany;
  corpus: ResearchCorpus;
  classified: {
    firstPartyContext?: FirstPartyContext;
    recentSignals: RecentSignals;
    hiringSignals: HiringSignals;
    securitySignals: SecuritySignals;
  };
  nodeGaps: string[];
}) {
  return [
    {
      role: "system" as const,
      content: `${GROUNDING_RULES}
Create a concise sales-preparation report for Torq, a security automation platform.
Use the classified findings as guidance, but verify every final claim against the supplied evidence IDs.
Talking points should be specific conversation openers, not generic product pitches.
Confidence and gaps must be candid and non-empty.`,
    },
    {
      role: "user" as const,
      content: JSON.stringify(
        {
          company: input.company,
          classifiedFindings: input.classified,
          retrievalOrExtractionGaps: input.nodeGaps,
          sources: input.corpus.sources,
          evidence: input.corpus.evidence,
        },
        null,
        2,
      ),
    },
  ];
}
