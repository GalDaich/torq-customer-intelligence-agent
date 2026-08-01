import type { ResolvedCompany } from "../lib/schemas";
import type { ResearchWindow } from "../lib/research-window";
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
- Classify specific news, funding, product, or leadership events, plus meaningful dated company-authored reports, guides, security or compliance updates, and customer stories that provide current conversation context.
- Require an individual article or announcement that clearly describes the event.
- Do not treat a homepage, newsroom index, blog index, search page, company profile, or undated summary as a recent event.
- One underlying event equals one signal, even when search returns multiple publishers or syndicated copies.
- Prefer the original company announcement; otherwise use the most authoritative dated article.
- Treat a dated, item-specific post from the company's own blog, newsroom, or press-release section as a strong source. An index page may help discovery but cannot support a signal.
- Exclude generic SEO listicles, broad educational posts, and recycled summaries that do not reveal a concrete company update, point of view, product direction, customer outcome, or operating priority.
- Do not infer that an event is recent when the supplied evidence lacks a usable date or clear recency context.
- Prefer events that can change operational scale or complexity—funding, acquisitions, expansion, leadership changes, product launches, and major partnerships—without inventing a security impact.
</task>

Silently check specificity, recency, uniqueness, and evidence IDs before returning only the structured output.
`.trim();

export function recentSignalMessages(
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
