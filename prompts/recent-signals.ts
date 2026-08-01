import type { ResolvedCompany } from "../lib/schemas";
import type { ResearchCorpus } from "../lib/tools";
import { evidenceBundle, GROUNDED_RESEARCH_RULES } from "./shared";

// Recent-signal classification favors useful company developments without imposing a
// hard date window that can leave a demo report empty.
const SYSTEM_PROMPT = `
<role>
You identify concrete company developments that can improve a customer conversation.
</role>

${GROUNDED_RESEARCH_RULES}

<task>
- Classify specific news, funding, product, or leadership events, plus meaningful dated company-authored reports, guides, security or compliance updates, and customer stories that provide current conversation context.
- Prefer an individual article or announcement, but use relevant company pages, indexes, profiles, and undated summaries when they provide useful context.
- One underlying event equals one signal, even when search returns multiple publishers or syndicated copies.
- Prefer the original company announcement; otherwise use the most authoritative dated article.
- Treat a company-authored blog, newsroom, press-release, report, guide, or customer-story page as useful context whether or not a publication date was extracted.
- Exclude irrelevant pages, but do not reject a relevant finding solely because the source is broad, syndicated, or undated.
- When a date is unknown, describe the development without inventing when it happened.
- Prefer events that can change operational scale or complexity—funding, acquisitions, expansion, leadership changes, product launches, and major partnerships—without inventing a security impact.
</task>

Silently check usefulness, uniqueness, and evidence IDs before returning only the structured output.
`.trim();

export function recentSignalMessages(
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
