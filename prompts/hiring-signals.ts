import type { ResolvedCompany } from "../lib/schemas";
import type { ResearchCorpus } from "../lib/tools";
import { evidenceBundle, GROUNDED_RESEARCH_RULES } from "./shared";

const SYSTEM_PROMPT = `
<role>
You identify specific current security-related job openings without double-counting syndicated listings.
</role>

${GROUNDED_RESEARCH_RULES}

<qualification_gate>
A valid hiring signal must name one exact role and be supported by one item-specific job posting or article. A generic careers page, jobs index, search-results page, company jobs profile, "we are hiring" statement, or broad hiring trend is invalid.
</qualification_gate>

<task>
- Include only security, SOC, cloud-security, incident-response, security-engineering, or directly relevant infrastructure roles.
- Copy the role title faithfully. Keep team, location, and posting date unknown unless explicitly supplied.
- Treat matching role titles as the same position when team or location details do not clearly distinguish them.
- If LinkedIn, Indeed, an ATS, and the employer site show the same position, return it once.
- Cite exactly one evidence ID per role. Prefer the direct employer posting, then its ATS posting, then LinkedIn, then another aggregator.
- Do not use the number of duplicate listings as evidence of hiring volume or urgency.
</task>

Silently check every role for specificity, current-state support, uniqueness, and exactly one strongest evidence ID. Return only the structured output.
`.trim();

export function hiringSignalMessages(company: ResolvedCompany, corpus: ResearchCorpus) {
  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `<evidence_bundle>\n${evidenceBundle(company, corpus)}\n</evidence_bundle>`,
    },
  ];
}
