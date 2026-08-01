# Assignment requirements coverage

Source of truth: [Torq AI Solutions Engineer take-home assignment](https://drive.google.com/file/d/1jhgBOxEnb8BftLvILefsnGk1-WCrzU-A/view?usp=sharing), reviewed on 2026-08-01.

## Level 1 product and research requirements

| Assignment requirement | Product implementation | Deterministic coverage |
| --- | --- | --- |
| Accept one company or a list of 3–5 through the UI | Removable tag input accepts 1–5 unique names or domains | Request schema and tag-input tests enforce the boundary |
| Automatically research free/public sources | Confirmed companies run independent LangGraph executions using Tavily and Firecrawl | Server-only environment contract; one failed company does not remove successful peers |
| Company website / first-party context | Firecrawl maps the confirmed official site, then scrapes the homepage plus up to two relevant company/platform/product/about pages | Only selected first-party evidence reaches synthesis; missing pages become visible gaps |
| Recent news, funding, product moves, and leadership | Dedicated one-year Tavily news plans and typed recent-signal classification | Specific article/announcement requirement; generic indexes and duplicate events are rejected or omitted |
| Hiring activity | Dedicated security plus adjacent DevSecOps/platform/infrastructure/IT-automation search plans | Specific posting requirement, aggregator suppression, one strongest source, and duplicate-position rejection |
| Tech-stack signals | Dedicated technology node searches engineering architecture, public stack mentions, and specific job requirements | One named technology per signal, one shared specific source, duplicate-technology rejection |
| Security-automation relevance | Security and technology nodes use a bounded Torq relevance frame; synthesis produces Torq-relevant hypotheses | Prompts prohibit claiming pain, fragmentation, manual work, connector availability, budget, urgency, or intent without target-company evidence |
| LLM analysis and synthesis across sources | Five specialist classifications feed a separate structured synthesis call | Node-selected lineage only; no raw omitted result can be reintroduced |
| What the company does in plain language | First-party extraction creates the required grounded `whatTheyDo` claim | Claim must resolve through evidence ID to a real source URL |
| Educated security-automation pain points | Normal synthesis targets 1–3 explicitly evidence-backed hypotheses | Prompt requires uncertainty; unsupported hypotheses are omitted and become a visible gap rather than blocking the report |
| 2–3 specific first-call talking points | Normal synthesis targets 2–3 evidence-backed conversation openers | Upper bound is enforced; weak evidence may return fewer with an explicit gap instead of generic quota-filling |
| Confidence and gaps as a first-class feature | Every node records gaps; synthesis consolidates them into a short report note; final report has its own collapsed Confidence & gaps category | Schema requires 1–6 bullets; restorative grounding records omitted findings and partial-report limitations |
| Designed, self-service browser product | Company confirmation, honest progress, launchpad report cards, company-named tabs, single-open accordion report | Static rendering and interaction-contract tests cover critical UI states |
| Loading, empty, weak-data, and failure states | Resolver, streamed graph progress, empty categories, partial batch failures, and visible gaps | Provider HTTP 4xx responses block; other provider, LLM, evidence, synthesis, and grounding issues become report gaps |
| Public/free-tier tools only | Next.js, OpenAI key, Tavily, Firecrawl, LangGraph, and LangSmith; no paid enrichment provider | Provider requests are bounded and server-only |

## Retrieval responsibilities

- Firecrawl is used where full first-party page content matters. Site mapping replaces guessed `/products` paths; only three targeted pages are scraped, main content is isolated, boilerplate tags are excluded, and a one-day cache window limits avoidable cost.
- Tavily is used for open-web discovery. Evidence nodes use advanced depth with two relevant chunks per source, five-result limits, 0.45 relevance thresholds for focused searches, a calibrated 0.35 threshold for external news, one-year filters for recent signals, and job-aggregator exclusions where direct sources are stronger. Resolution remains a cheaper basic search.
- Provider payloads are normalized into strict `Source` and `Evidence` records. Canonical URLs, repeated excerpts, duplicate jobs, duplicate technologies, generic pages, and uncited lineage are deterministically rejected or removed.

## Torq product frame

The relevance frame is based on Torq's official positioning: the AI SOC and Hyperautomation platform coordinates existing security tools across alert triage, investigation, containment, remediation, case management, and cross-tool workflows. Relevant integration areas include SIEM, EDR/XDR, cloud security, identity, phishing/email security, threat intelligence, vulnerability management, ticketing, and collaboration. This frame guides prioritization but is never treated as evidence about a researched company.

## Submission items still requiring acceptance

Code-level Level 1 coverage is implemented and deterministically tested. A real credential-backed HiBob run completed all seven stages without failure and is preserved in `sample-report.md`; it demonstrated grounded first-party, recent, security, and named-technology findings while honestly returning no qualifying hiring role. The assignment is not submission-complete until the remaining live acceptance matrix passes and matching LangSmith traces and external source links are reviewed. Level 2 watchlists, persistence, change detection, and a change feed remain intentionally deferred because Level 2 is optional.
