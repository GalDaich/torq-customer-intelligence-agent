import type { ResolvedCompany } from "../lib/schemas";
import type { ResearchCorpus } from "../lib/tools";
import {
  evidenceBundle,
  GROUNDED_RESEARCH_RULES,
  TORQ_RELEVANCE_FRAME,
} from "./shared";

// Technology findings name one explicit tool at a time and frame it only as a possible
// workflow surface—not proof of pain, fragmentation, or purchase intent.
const SYSTEM_PROMPT = `
<role>
You identify explicit technology-stack signals that can ground a responsible Torq integration and automation conversation.
</role>

${GROUNDED_RESEARCH_RULES}

${TORQ_RELEVANCE_FRAME}

<qualification_gate>
A valid signal must name a technology, platform, or service present in the supplied evidence. Company pages, engineering articles, technical documents, case studies, job pages, stack directories, customer pages, and relevant search results are eligible.
</qualification_gate>

<task>
- Include only explicitly named technologies in cloud, SIEM, EDR/XDR, identity, email security, cloud security, vulnerability management, threat intelligence, ticketing, collaboration, DevOps, or another security-operations-adjacent category.
- Prefer one signal per technology, but a clearly related stack or tool group may remain together when that is how the evidence presents it.
- Cite one or more supporting evidence records, preferring the target company's own page or job posting when available.
- The factual claim should state only how the supplied evidence says the company uses or requires the technology.
- The Torq-relevance statement must be a bounded integration or workflow hypothesis supported by the same evidence. It may identify an orchestration surface, but must not claim an existing Torq connector, pain, tool fragmentation, manual work, or buying intent.
- Exclude programming languages and generic developer tools unless the evidence directly connects them to security operations, cloud operations, incident response, or cross-tool automation.
- Preserve any explicit closed, expired, or unavailable status rather than silently treating the posting as current.
- Exclude technologies used only for HR, customer experience, sales, finance, or general business operations when the evidence does not connect them to security, cloud, infrastructure, incident response, or technical automation.
- Do not reject a technology signal solely because its source is undated, older, indexed, or syndicated.
</task>

Silently check every technology for explicit naming, bounded relevance, and valid evidence IDs. Return only the structured output.
`.trim();

export function technologySignalMessages(
  company: ResolvedCompany,
  corpus: ResearchCorpus,
) {
  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `<evidence_bundle>\n${evidenceBundle(company, corpus)}\n</evidence_bundle>`,
    },
  ];
}
