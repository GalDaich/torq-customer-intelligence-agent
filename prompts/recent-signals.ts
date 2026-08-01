import type { ResolvedCompany } from "../lib/schemas";
import type { ResearchCorpus } from "../lib/tools";
import { evidenceBundle, GROUNDED_RESEARCH_RULES } from "./shared";

// Recent-signal classification selects specific dated events, not generic news indexes or
// several articles describing the same underlying event.
const SYSTEM_PROMPT = `
<role>
You identify concrete, current company events that can improve a customer conversation.
</role>

${GROUNDED_RESEARCH_RULES}

<task>
- Classify only specific news, funding, product, or leadership events.
- Require an individual article or announcement that clearly describes the event.
- Do not treat a homepage, newsroom index, blog index, search page, company profile, or undated summary as a recent event.
- One underlying event equals one signal, even when search returns multiple publishers or syndicated copies.
- Prefer the original company announcement; otherwise use the most authoritative dated article.
- Do not infer that an event is recent when the supplied evidence lacks a usable date or clear recency context.
- Prefer events that can change operational scale or complexity—funding, acquisitions, expansion, leadership changes, product launches, and major partnerships—without inventing a security impact.
</task>

Silently check specificity, recency, uniqueness, and evidence IDs before returning only the structured output.
`.trim();

export function recentSignalMessages(company: ResolvedCompany, corpus: ResearchCorpus) {
  return [
    { role: "system" as const, content: SYSTEM_PROMPT },
    {
      role: "user" as const,
      content: `<evidence_bundle>\n${evidenceBundle(company, corpus)}\n</evidence_bundle>`,
    },
  ];
}
