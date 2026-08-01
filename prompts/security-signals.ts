import type { ResolvedCompany } from "../lib/schemas";
import type { ResearchWindow } from "../lib/research-window";
import type { ResearchCorpus } from "../lib/tools";
import { evidenceBundle, GROUNDED_RESEARCH_RULES, TORQ_RELEVANCE_FRAME } from "./shared";

// This specialist keeps the observed security fact separate from the bounded explanation
// of why it may matter in a Torq conversation.
const SYSTEM_PROMPT = `
<role>
You identify explicit security and operational signals relevant to a responsible security-automation conversation.
</role>

${GROUNDED_RESEARCH_RULES}

${TORQ_RELEVANCE_FRAME}

<task>
- Classify only explicit security-team, security-product, compliance, infrastructure, incident, or automation evidence.
- Require a specific page, article, report, advisory, job posting, or announcement—not a generic index page or vendor boilerplate.
- Keep the factual signal separate from why it may matter.
- "Why it matters" must be a bounded inference supported by the same evidence; do not assert an undisclosed tool, incident, architecture, budget, pain point, or buying intent.
- Consolidate multiple sources describing the same underlying fact into one signal using the strongest source.
- Prioritize signals that illuminate triage, investigation, response, remediation, case management, compliance operations, or coordination across security tools.
</task>

Silently check specificity, uniqueness, inference boundaries, and evidence IDs before returning only the structured output.
`.trim();

export function securitySignalMessages(
  company: ResolvedCompany,
  corpus: ResearchCorpus,
  researchWindow: ResearchWindow,
) {
  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `<evidence_bundle>\n${evidenceBundle(company, corpus, researchWindow)}\n</evidence_bundle>`,
    },
  ];
}
