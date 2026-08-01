import type { ResolvedCompany } from "../lib/schemas";
import type { ResearchCorpus } from "../lib/tools";
import {
  evidenceBundle,
  GROUNDED_RESEARCH_RULES,
  TORQ_RELEVANCE_FRAME,
} from "./shared";

const SYSTEM_PROMPT = `
<role>
You identify explicit technology-stack signals that can ground a responsible Torq integration and automation conversation.
</role>

${GROUNDED_RESEARCH_RULES}

${TORQ_RELEVANCE_FRAME}

<qualification_gate>
A valid signal must name one specific technology, platform, or service and be supported by an item-specific company page, engineering article, technical document, case study, or individual job posting. Generic stack directories, vendor customer-logo pages, homepages, careers indexes, and unsupported search summaries are invalid.
</qualification_gate>

<task>
- Include only explicitly named technologies in cloud, SIEM, EDR/XDR, identity, email security, cloud security, vulnerability management, threat intelligence, ticketing, collaboration, DevOps, or another security-operations-adjacent category.
- Produce one signal per technology and put exactly one technology name in the technology field. "Zendesk and JIRA", "Slack / Asana", comma-separated names, and other grouped names are invalid; return separate signals or select only the strongest security-relevant technology.
- If several sources name the same technology, cite exactly one strongest evidence record, preferring the target company's own specific page or job posting.
- The factual claim should state only how the supplied evidence says the company uses or requires the technology.
- The Torq-relevance statement must be a bounded integration or workflow hypothesis supported by the same evidence. It may identify an orchestration surface, but must not claim an existing Torq connector, pain, tool fragmentation, manual work, or buying intent.
- Exclude programming languages and generic developer tools unless the evidence directly connects them to security operations, cloud operations, incident response, or cross-tool automation.
- Exclude closed, expired, or explicitly unavailable job postings.
- Exclude technologies used only for HR, customer experience, sales, finance, or general business operations when the evidence does not connect them to security, cloud, infrastructure, incident response, or technical automation.
</task>

Silently check every technology for explicit naming, source specificity, uniqueness, bounded relevance, and exactly one strongest evidence ID. Return only the structured output.
`.trim();

export function technologySignalMessages(company: ResolvedCompany, corpus: ResearchCorpus) {
  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `<evidence_bundle>\n${evidenceBundle(company, corpus)}\n</evidence_bundle>`,
    },
  ];
}
