import type {
  FirstPartyContext,
  HiringSignals,
  RecentSignals,
  ResolvedCompany,
  SecuritySignals,
  TechnologySignals,
} from "../lib/schemas";
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
- Use the available classified findings broadly; do not impose an additional source-quality or freshness gate during synthesis.
- Represent each underlying event, job, or security fact once in its reporting category.
- Preserve the supplied evidence citations for each hiring role.
- Derive likely pain points cautiously and label uncertainty through confidence and gaps.
- Aim for 1–3 useful likely pain points as evidence-informed hypotheses relevant to security automation. Cite the company evidence that motivates each hypothesis and never present it as a known internal problem.
- Aim for 2–3 specific, natural first-call talking points tied to target-company evidence. They may be exploratory questions based on the evidence rather than proven customer needs.
- Set whatTheyDo to null only when no supplied evidence responsibly supports a plain-language company description, and record that limitation as a gap.
- Keep temporal meaning intact: preserve known dates and avoid claiming that an undated or older item is current.
- Use technology signals to identify credible integration or orchestration surfaces, but never treat the presence of one tool as proof of fragmentation, manual work, or replacement intent.
- Consolidate the supplied retrieval and extraction limitations into 1–6 candid, concrete, non-repetitive confidence-and-gap bullets. Keep only what a human should verify before acting.
</task>

Silently audit the report for unsupported factual claims, accidental duplication, and invalid evidence IDs. Return only the structured output.
`.trim();

export function synthesisMessages(input: {
  company: ResolvedCompany;
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
