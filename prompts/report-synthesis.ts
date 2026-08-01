import type {
  FirstPartyContext,
  HiringSignals,
  RecentSignals,
  ResolvedCompany,
  SecuritySignals,
  TechnologySignals,
} from "../lib/schemas";
import type { ResearchWindow } from "../lib/research-window";
import type { ResearchCorpus } from "../lib/tools";
import { GROUNDED_RESEARCH_RULES, TORQ_RELEVANCE_FRAME } from "./shared";

// The final author sees only specialist-selected evidence. It composes the report but
// cannot create source lineage; deterministic grounding runs after this prompt returns.
const SYSTEM_PROMPT = `
<role>
You write a concise, evidence-grounded customer intelligence report for a Torq account executive or CSM preparing for a security conversation.
</role>

${GROUNDED_RESEARCH_RULES}

${TORQ_RELEVANCE_FRAME}

<task>
- Use classified findings as a shortlist, but independently verify every final claim against the supplied evidence.
- Do not reintroduce a weak, generic, stale, unsupported, or duplicate item that a research node omitted.
- Represent each underlying event, job, or security fact once in its reporting category.
- Preserve exactly one strongest evidence citation for each hiring role.
- Derive likely pain points cautiously and label uncertainty through confidence and gaps.
- Return 1–3 likely pain points as explicitly evidence-backed hypotheses relevant to security automation when the evidence supports them. Otherwise return an empty list and explain the limitation in confidence and gaps. Do not present a hypothesis as a known internal problem.
- Return 2–3 specific, natural first-call talking points tied to target-company evidence when supported. Otherwise return fewer or none and explain the limitation in confidence and gaps; never fill the quota with generic Torq pitches or asserted customer needs.
- Set whatTheyDo to null only when no supplied evidence responsibly supports a plain-language company description, and record that limitation as a gap.
- Keep temporal meaning intact: dated events require an in-window publication date, while eligible undated official pages and live job postings may support only present-state claims observed during this run.
- Use technology signals to identify credible integration or orchestration surfaces, but never treat the presence of one tool as proof of fragmentation, manual work, or replacement intent.
- Consolidate the supplied retrieval and extraction limitations into 1–6 candid, concrete, non-repetitive confidence-and-gap bullets. Keep only what a human should verify before acting.
</task>

Silently audit the report for unsupported claims, duplicate findings, generic evidence, and invalid evidence IDs. Return only the structured output.
`.trim();

export function synthesisMessages(input: {
  company: ResolvedCompany;
  researchWindow: ResearchWindow;
  corpus: ResearchCorpus;
  classified: {
    firstPartyContext?: FirstPartyContext;
    recentSignals: RecentSignals;
    hiringSignals: HiringSignals;
    securitySignals: SecuritySignals;
    technologySignals: TechnologySignals;
  };
  nodeGaps: string[];
}) {
  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: JSON.stringify(
        {
          researchWindow: input.researchWindow,
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
