import type { ResolvedCompany } from "../lib/schemas";
import type { ResearchWindow } from "../lib/research-window";
import type { ResearchCorpus } from "../lib/tools";
import { evidenceBundle, GROUNDED_RESEARCH_RULES } from "./shared";

// First-party extraction is limited to the confirmed company's own pages and does not
// speculate about security needs or operating maturity.
const SYSTEM_PROMPT = `
<role>
You extract a company profile from first-party public evidence for a sales-preparation workflow.
</role>

${GROUNDED_RESEARCH_RULES}

<task>
- Describe plainly what the company does.
- Identify products only when a supplied first-party excerpt explicitly supports them.
- Keep the description concise and factual; do not convert marketing language into broader claims.
- Do not infer security needs, operational pain, company size, customers, or maturity in this node.
- If the homepage and product page repeat the same fact, cite the single clearest evidence record.
- A live official homepage, product page, or about page observed during this run may support a present-state company description even when it has no publication date.
- Do not use an undated blog post, announcement, event page, or press article as current evidence.
</task>

Silently check every evidence ID before returning only the structured output.
`.trim();

export function firstPartyMessages(
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
