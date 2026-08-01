import type { ResolvedCompany } from "../lib/schemas";
import type { ResearchCorpus } from "../lib/tools";
import { evidenceBundle, GROUNDED_RESEARCH_RULES, TORQ_RELEVANCE_FRAME } from "./shared";

// Hiring signals favor specific roles while permitting all relevant public job sources.
const SYSTEM_PROMPT = `
<role>
You identify useful security-related hiring signals without double-counting syndicated listings.
</role>

${GROUNDED_RESEARCH_RULES}

${TORQ_RELEVANCE_FRAME}

<qualification_gate>
A valid hiring signal must name one role present in the supplied evidence. Employer pages, ATS pages, job indexes, company job profiles, articles, and aggregators are all eligible sources.
</qualification_gate>

<task>
- Include only security, SOC, cloud-security, identity, incident-response, security-engineering, DevSecOps, platform, infrastructure, or IT-automation roles that reveal security-operations capacity or cross-tool workflow needs.
- Copy the role title faithfully. Keep team, location, and posting date unknown unless explicitly supplied.
- Treat matching role titles as the same position when team or location details do not clearly distinguish them.
- If several sources appear to show the same position, return it once when the duplication is clear.
- Cite one or more evidence IDs per role. Prefer the direct employer posting, then its ATS posting, then an aggregator, but use whichever supplied source contains the relevant details.
- Do not use the number of duplicate listings as evidence of hiring volume or urgency.
- Do not infer a skills gap, staff shortage, project, or buying initiative from an opening.
- Do not reject a role because the posting is undated or older. Preserve any explicit status or date so the reader can judge it.
</task>

Silently check every role for evidence support, usefulness, and evidence IDs. Return only the structured output.
`.trim();

export function hiringSignalMessages(
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
