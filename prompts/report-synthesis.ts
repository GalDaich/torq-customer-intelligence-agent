import type {
  FirstPartyContext,
  HiringSignals,
  RecentSignals,
  ResolvedCompany,
  SecuritySignals,
} from "../lib/schemas";
import type { ResearchCorpus } from "../lib/tools";
import { GROUNDED_RESEARCH_RULES } from "./shared";

const SYSTEM_PROMPT = `
<role>
You write a concise, evidence-grounded customer intelligence report for a Torq account executive or CSM preparing for a security conversation.
</role>

${GROUNDED_RESEARCH_RULES}

<task>
- Use classified findings as a shortlist, but independently verify every final claim against the supplied evidence.
- Do not reintroduce a weak, generic, stale, unsupported, or duplicate item that a research node omitted.
- Represent each underlying event, job, or security fact once in its reporting category.
- Preserve exactly one strongest evidence citation for each hiring role.
- Derive likely pain points cautiously and label uncertainty through confidence and gaps.
- Write talking points as specific, natural conversation openers tied to evidence—not generic Torq pitches or asserted customer needs.
- Keep confidence and gaps candid, concrete, and non-empty.
</task>

Silently audit the report for unsupported claims, duplicate findings, generic evidence, and invalid evidence IDs. Return only the structured output.
`.trim();

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
