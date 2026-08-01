# Customer Intelligence Agent — Implementation Plan

## Implementation status — 2026-08-01

Completed locally:

- Next.js App Router TypeScript application and server-only environment contract.
- Strict Zod schemas and deterministic claim-to-evidence-to-source validation, including generic-source and duplicate-job rejection.
- Tavily and Firecrawl normalization wrappers.
- Five parallel research nodes, including named technology-stack research, LLM synthesis, and deterministic final validation.
- Per-company UUID, LangGraph `thread_id`, LangSmith metadata, graph trace tags, and pre-graph identity-normalization tracing.
- Tavily-backed primary-homepage discovery, few-shot LLM identity ranking and normalization, mandatory per-company confirmation/manual entry/discard, independent batch execution, and partial failures.
- LangGraph task-event streaming with an event-driven progress bar and no browser activity log.
- LangSmith tracing for pre-graph identity normalization, graph execution, and LLM calls; no application-owned structured logging.
- Torq-inspired responsive browser UI with a completed-report launchpad, company-named report tabs, single-open report accordions, source badges, and visible gaps.
- Dedicated root `prompts/` modules for every LLM operation; no runtime prompt remains inline with orchestration code.
- Focused tests, lint, type-checking, optimized production build, and missing-credential browser verification.
- A credential-backed HiBob report that completed all seven graph stages without failure and is preserved in `sample-report.md`.

Pending before the local milestone can be called complete:

- Run the one-company, ambiguous-name, five-company, weak-data, and provider-failure live checks.
- Verify matching LangSmith traces and every external source link.
- Re-run the npm advisory audit in an environment approved to query npm's advisory service.

Deployment and domain work remain deferred.

## Purpose

Build a local-first Level 1 Customer Intelligence Agent for Torq's AI Solutions Engineer take-home assignment.

The product must let a non-technical account executive or CSM:

1. Enter one to five company names or domains using removable tags.
2. Review up to four ranked official-website candidates for every company.
3. Confirm a candidate, enter the official website manually, or discard the company before any report can start.
4. Run grounded company research.
5. Read a concise, useful report with clickable supporting sources.

The first milestone is local execution and behavioral verification. Deployment to Vercel and configuration of a purchased domain are separate decisions after the local product is working well.

## Working rules

- Keep the implementation lean. Every file, dependency, function, and field must have a clear purpose.
- Do not add Level 2 functionality during Level 1 implementation.
- Keep all provider keys server-side.
- Treat evidence and grounding as correctness requirements, not optional polish.
- Use strict, fixed contracts for every node boundary.
- Do not let the LLM invent URLs, source titles, evidence excerpts, or unsupported claims.
- Add short inline comments where code crosses a system boundary or a non-obvious decision needs explanation. Do not comment obvious syntax.
- Update this plan when a milestone is completed or an agreed design decision changes.

## Scope

### Included in Level 1

- Tag-based company name or domain input.
- Maximum of five companies per research request.
- Public web search for company identity resolution.
- Mandatory human confirmation for every company match, with manual website entry and discard alternatives.
- Separate LangGraph research nodes for:
  - First-party company context.
  - Recent news, funding, product, and leadership signals.
  - Hiring signals.
  - Security and operational signals.
  - Named technology-stack and Torq-relevant integration signals.
- Tavily for web search.
- Firecrawl for targeted first-party page scraping.
- LLM analysis inside research nodes and final report synthesis.
- Strict Zod contracts for data exchange.
- Evidence-backed claims with source IDs.
- Compact clickable source links in every report.
- One UUID and one independently traceable LangSmith graph execution per company.
- Honest loading, empty, ambiguity, low-confidence, and failure states.
- Local README and generated sample report.

### Explicitly deferred

- Watchlist management.
- Change detection.
- Scheduled refreshes.
- Database persistence.
- Authentication and authorization.
- Background job queues.
- Workflow engines such as n8n.
- Custom Vercel deployment configuration.
- Custom domain configuration.

The UUID and graph state should be shaped so persistence can be added later, but Level 1 does not require a database.

## Product flow

```text
Company tags
    -> POST /api/resolve
    -> Primary official-homepage search and up-to-four candidate grouping
    -> Few-shot LLM ranks and normalizes candidates under fixed ID/domain/URL controls
    -> User confirms a candidate, enters a website manually, or discards each company
    -> POST /api/research
    -> Stream actual LangGraph task events
    -> One LangGraph execution per company
    -> Grounding validation
    -> One report per company
```

The resolution step is an explicit human-in-the-loop product interaction and a hard gate before research. A `unique` status describes search confidence only; it never authorizes an automatic graph run. For Level 1, the browser holds candidate, manual-site, and discard decisions between the two API requests. LangGraph's durable interrupt/checkpointer flow is deferred because it would add persistence infrastructure that the current scope does not require.

## Technology choices

### Application

- Next.js App Router.
- TypeScript.
- Minimal CSS using project-owned design tokens.
- Server-side Route Handlers for provider calls.

### AI orchestration

- `@langchain/langgraph` for the per-company graph.
- `@langchain/core` for shared LangChain types and execution.
- `@langchain/openai` for the LLM integration unless a provider decision changes before implementation.
- LangSmith tracing enabled through environment configuration.

### Data and validation

- Zod for runtime validation and inferred TypeScript types.
- No database in Level 1.
- No client-side provider calls.

### External research tools

- Tavily Search for company discovery and focused signal searches.
- Firecrawl Scrape for selected first-party pages.
- Small server-side `fetch` wrappers are preferred over adding provider SDKs that do not materially reduce code.

## Planned repository structure

```text
IMPLEMENTATION_PLAN.md
README.md
sample-report.md
.env.example

app/
  page.tsx
  globals.css
  api/
    resolve/
      route.ts
    research/
      route.ts

components/
  company-tag-input.tsx
  company-resolution.tsx
  research-progress.tsx
  research-workspace.tsx
  company-report.tsx
  report-launchpad.tsx

lib/
  company-normalization.ts
  evidence-quality.ts
  schemas.ts
  research-stream.ts
  tools.ts
  graph.ts

prompts/
  company-identity-normalization.ts
  first-party-context.ts
  recent-signals.ts
  hiring-signals.ts
  security-signals.ts
  report-synthesis.ts
  shared.ts
```

Files should be added only when they hold a distinct responsibility. Avoid creating generic `utils`, `services`, or abstraction layers without a concrete use.

## Environment contract

Create `.env.example` with the following server-side variables:

```text
OPENAI_API_KEY=
OPENAI_MODEL=

TAVILY_API_KEY=
FIRECRAWL_API_KEY=

LANGSMITH_TRACING=true
LANGSMITH_API_KEY=
LANGSMITH_PROJECT=torq-customer-intelligence-agent
LANGSMITH_ENDPOINT=https://api.smith.langchain.com
```

Local secrets belong in `.env.local`, which must not be committed.

The browser must never receive any provider API key or raw provider authorization header.

## Fixed data contracts

`lib/schemas.ts` is the single source of truth for all runtime and TypeScript contracts.

All objects should use strict Zod schemas. Node outputs must not contain arbitrary fields.

### Source

```ts
const Source = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().url(),
  publisher: z.string(),
  sourceType: z.enum([
    "company",
    "news",
    "hiring",
    "security",
    "funding",
    "linkedin",
    "other"
  ]),
  publishedAt: z.string().nullable()
}).strict();
```

### Evidence

```ts
const Evidence = z.object({
  id: z.string(),
  sourceId: z.string(),
  excerpt: z.string(),
  collectedAt: z.string()
}).strict();
```

Evidence excerpts must come from search or scraping output. The LLM may select evidence IDs but must not author evidence excerpts.

### Grounded claim

```ts
const GroundedClaim = z.object({
  text: z.string(),
  evidenceIds: z.array(z.string()).min(1),
  confidence: z.enum(["high", "medium", "low"])
}).strict();
```

Every report claim uses this structure or a more specific object containing the same required `evidenceIds` relationship.

### Company resolution

```ts
const CompanyCandidate = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string().nullable(),
  websiteUrl: z.string().url().nullable(),
  description: z.string(),
  sourceIds: z.array(z.string())
}).strict();

const CompanyResolution = z.object({
  researchId: z.string().uuid(),
  inputName: z.string(),
  status: z.enum(["unique", "ambiguous", "not_found"]),
  candidates: z.array(CompanyCandidate),
  sources: z.array(Source),
  gaps: z.array(z.string())
}).strict();

const ResolvedCompany = z.object({
  inputName: z.string(),
  name: z.string(),
  domain: z.string(),
  websiteUrl: z.string().url(),
  description: z.string()
}).strict();
```

### Research node outputs

#### First-party context

```ts
const FirstPartyContext = z.object({
  whatTheyDo: GroundedClaim,
  products: z.array(GroundedClaim),
  confidence: z.enum(["high", "medium", "low"]),
  gaps: z.array(z.string())
}).strict();
```

#### Recent signals

```ts
const RecentSignal = z.object({
  category: z.enum(["news", "funding", "product", "leadership"]),
  claim: GroundedClaim
}).strict();

const RecentSignals = z.object({
  signals: z.array(RecentSignal),
  confidence: z.enum(["high", "medium", "low"]),
  gaps: z.array(z.string())
}).strict();
```

#### Hiring signals

```ts
const HiringSignal = z.object({
  roleTitle: z.string(),
  team: z.string().nullable(),
  location: z.string().nullable(),
  postedAt: z.string().nullable(),
  claim: GroundedClaim
}).strict();

const HiringSignals = z.object({
  signals: z.array(HiringSignal),
  confidence: z.enum(["high", "medium", "low"]),
  gaps: z.array(z.string())
}).strict();
```

#### Security signals

```ts
const SecuritySignal = z.object({
  category: z.enum([
    "security_team",
    "security_product",
    "compliance",
    "infrastructure",
    "incident",
    "automation"
  ]),
  claim: GroundedClaim,
  whyItMatters: GroundedClaim
}).strict();

const SecuritySignals = z.object({
  signals: z.array(SecuritySignal),
  confidence: z.enum(["high", "medium", "low"]),
  gaps: z.array(z.string())
}).strict();
```

#### Technology signals

```ts
const TechnologySignal = z.object({
  technology: z.string(),
  category: z.enum(["cloud", "siem", "edr_xdr", "identity", "email_security", "cloud_security", "vulnerability_management", "threat_intelligence", "ticketing", "collaboration", "devops", "other"]),
  claim: GroundedClaim,
  torqRelevance: GroundedClaim
}).strict();

const TechnologySignals = z.object({
  signals: z.array(TechnologySignal).max(12),
  confidence: z.enum(["high", "medium", "low"]),
  gaps: z.array(z.string())
}).strict();
```

### Final report

```ts
const PainPoint = z.object({
  painPoint: z.string(),
  rationale: GroundedClaim
}).strict();

const TalkingPoint = z.object({
  point: z.string(),
  rationale: GroundedClaim
}).strict();

const CompanyReport = z.object({
  researchId: z.string().uuid(),
  company: ResolvedCompany,
  whatTheyDo: GroundedClaim,
  recentSignals: z.array(RecentSignal),
  hiringSignals: z.array(HiringSignal),
  securitySignals: z.array(SecuritySignal),
  technologySignals: z.array(TechnologySignal),
  likelyPainPoints: z.array(PainPoint).min(1).max(3),
  talkingPoints: z.array(TalkingPoint).min(2).max(3),
  confidenceAndGaps: z.array(z.string()).min(1),
  sources: z.array(Source),
  evidence: z.array(Evidence)
}).strict();
```

`hiringSignals`, `securitySignals`, and `technologySignals` are retained in the final report so the
required report UI can render those graph outputs without discarding evidence.

## API contracts

### `POST /api/resolve`

Request:

```ts
{
  companies: string[]
}
```

Behavior:

- Validate one to five names or domains.
- Trim and deduplicate inputs.
- Generate one `researchId` per submitted company.
- For a domain, constrain discovery to that domain and group root/subdomain results.
- For a name, search specifically for the primary official homepage and retain up to four plausible normalized name/domain-stem matches.
- Send only plausible candidates through strict structured-output identity normalization.
- Few-shot the model to rank likely primary official domains first and rewrite only `name` and `description`; retain candidate ID, domain, website URL, and source IDs deterministically.
- Reject failed normalization, missing/duplicate candidate IDs, and invented candidate references instead of using raw page-title text.
- Mark one plausible match as `unique`; mark multiple plausible matches as `ambiguous`.
- Require an explicit candidate, manual website, or discard decision for every submitted company before enabling research.
- Return `CompanyResolution[]`.

Response:

```ts
{
  resolutions: CompanyResolution[]
}
```

### `POST /api/research`

Request:

```ts
{
  companies: Array<{
    researchId: string;
    company: ResolvedCompany;
  }>
}
```

Behavior:

- Validate selected companies and UUIDs.
- Run one graph invocation per company.
- Guard each concurrent company run so partial success is preserved.
- Stream real task start, completion, and failure events as newline-delimited JSON.
- Finish with successful reports and company-specific failures.

Stream events:

```ts
{
  type: "progress";
  batchId: string;
  researchId: string;
  companyName: string;
  stage: ResearchStage;
  status: "started" | "completed" | "failed";
  message: string;
  completedSteps: number;
  totalSteps: number;
  durationMs: number | null;
}
```

Final stream event:

```ts
{
  type: "complete";
  response: {
    reports: CompanyReport[];
    failures: Array<{
      researchId: string;
      companyName: string;
      message: string;
    }>;
  };
}
```

## LangGraph design

Compile one graph definition and invoke it independently for each company.

```text
Selected company
    -> firstPartyContext
    -> recentSignals
    -> hiringSignals
    -> securitySignals
    -> technologySignals
    -> synthesizeReport
    -> validateReport
    -> final report
```

The research nodes should be parallelizable because they are independent evidence-gathering tasks. The synthesis node must wait for all available research outputs.

### Node responsibilities

#### `firstPartyContext`

- Tool: Firecrawl map plus targeted scrapes.
- Target: selected official homepage plus up to two high-value company/platform/product/about pages discovered from the official site map.
- Extract plain-language company description and products.
- Preserve source and evidence lineage.

#### `recentSignals`

- Tool: Tavily Search.
- Two advanced-depth, score-filtered searches for recent funding/expansion/leadership and product/partnership activity, constrained to the last year.
- Extract only evidence-backed signals.

#### `hiringSignals`

- Tool: Tavily Search.
- Two advanced-depth, score-filtered patterns cover security roles and adjacent DevSecOps/platform/infrastructure/IT-automation roles.

```text
"{company}" open security SOC incident response cloud security identity job role
"{company}" open platform engineering DevSecOps infrastructure IT automation job role
```

- Accept only specific open roles or item-specific hiring articles; reject generic careers and jobs indexes.
- Consolidate the same position across employer, ATS, LinkedIn, Indeed, and other republished listings, retaining one strongest source.
- Treat missing dates as unknown rather than inventing them.
- Exclude common aggregators during retrieval so direct employer and ATS evidence is preferred before deduplication.

#### `securitySignals`

- Tool: Tavily Search.
- Advanced-depth plans separate durable security/compliance evidence from one-year incident and threat news.

```text
"{company}" security operations SOC incident response compliance security team automation
"{company}" breach vulnerability cloud security identity phishing threat response
```

- Separate explicit security evidence from inferred operational complexity.

#### `technologySignals`

- Tool: Tavily Search.
- Three advanced-depth, score-filtered plans inspect public security-stack mentions, first-party engineering architecture, and specific job requirements.
- Accept only explicitly named technologies from a specific company page, engineering article, technical document, case study, or individual job posting.
- Return one signal per technology with one shared strongest evidence record for both the factual use claim and bounded Torq relevance.
- Treat a named tool as a potential integration surface, never as proof of fragmentation, manual work, pain, or buying intent.

#### `synthesizeReport`

- Tool: LLM.
- Input: typed outputs from all research nodes, sources, and evidence.
- Output: `CompanyReport` candidate.
- Must reference existing evidence IDs.
- Must include useful gaps when evidence is weak or missing.

#### `validateReport`

- No LLM.
- Validate the final Zod schema.
- Confirm every evidence ID exists.
- Confirm every evidence record references a source.
- Confirm every source URL is valid.
- Reject unsupported claims.

## Grounding rules

These rules must be enforced in code and prompts:

1. Search and scraping code creates `Source` and `Evidence` records.
2. LLM prompts receive only bounded evidence records, and synthesis receives only evidence selected by typed research-node output.
3. LLM outputs reference existing `evidenceIds`.
4. The LLM cannot create URLs or source records.
5. Every final claim requires at least one evidence ID.
6. Pain points and talking points are explicitly treated as evidence-backed inferences.
7. If there is not enough evidence, the output contains a gap instead of a claim.
8. Generic careers, jobs, news, and index pages cannot support item-specific findings.
9. The same job or event cannot be counted repeatedly because multiple sites republished it.
10. Hiring roles cite exactly one strongest item-specific evidence record.
11. Named technologies cite exactly one shared strongest item-specific evidence record and cannot repeat.
12. The final report retains only cited evidence and the source list needed by the UI.

## UUID and LangSmith tracing

Generate each `researchId` with `crypto.randomUUID()`.

The same ID is used in:

- Company resolution state.
- Identity-normalization LangSmith metadata and `research:<researchId>` tag.
- Selected company payload.
- LangGraph state.
- LangGraph `thread_id`.
- LangSmith metadata.
- LangSmith tags.
- Final report.
- Future persistence records.

Each company must be invoked independently. The route guards each promise so the stream can preserve partial results:

```ts
await Promise.all(
  companies.map(async ({ researchId, company }) => {
    try {
      return { report: await runCompanyResearch(researchId, company) };
    } catch (error) {
      return { failure: publicCompanyFailure(researchId, company, error) };
    }
  }),
);
```

Each invocation receives metadata similar to:

```ts
{
  configurable: {
    thread_id: researchId
  },
  metadata: {
    researchId,
    companyName: company.name,
    domain: company.domain
  },
  tags: [
    "customer-intelligence",
    `research:${researchId}`
  ]
}
```

Five submitted companies must produce five reports, five research IDs, and five independently searchable LangSmith traces.

The batch route must not wrap all companies in one graph execution.

## UI implementation

### Research workspace

The main screen should contain:

- Short product title.
- Tag input.
- One primary action.
- Resolution state when needed.
- Reports after research completes.

Avoid sidebars, dashboard metrics, extra navigation, and unnecessary headlines.

### Resolution state

For each input company, show:

- Ready.
- Choose a company.
- No confident match found.

Ambiguous candidates should appear as compact selectable cards with name, domain, description, and source link.

### Report state

Each report should show:

1. Company identity.
2. What they do.
3. Recent signals.
4. Hiring signals.
5. Security signals.
6. Likely Torq-relevant pain points.
7. Technology and integration signals.
8. Suggested talking points.
9. Confidence and gaps.
10. Compact sources section.

Claims should show small inline source badges such as `[S1]` and `[S2]`. The source list should contain clickable titles or publisher labels that open the actual URL in a new tab.

### Required states

- Empty input.
- Invalid input.
- Research in progress.
- Unique company resolution.
- Ambiguous company resolution.
- No confident match.
- Successful report.
- Partial batch success.
- No meaningful public footprint.
- Search failure.
- Scrape failure.
- LLM failure.
- Grounding validation failure.

Progress indicators must be honest. Do not display fake node progress unless the API actually streams node updates.

The implemented progress view uses LangGraph's task stream as its only source of stage state. A partial failure may finish below 100% when downstream stages never ran; the UI labels that state as incomplete rather than manufacturing completion.

## Observability contract

- The browser shows transient progress state but no activity or run log.
- The application does not emit custom backend, provider, or model log records.
- `batchId` and `researchId` correlate concurrent progress events without combining independent graph traces.
- LangSmith is the detailed graph/model trace destination and uses the same per-company `researchId`.
- Pre-graph identity normalization is a separate named LangSmith model run because canonical identity is required before the research graph can start.

## Torq-inspired styling

Define visual tokens in `app/globals.css`:

```css
--background: #07090d;
--surface: #10131a;
--border: #252a35;
--text-primary: #f5f7fb;
--text-muted: #98a1b3;
--accent: electric-blue-or-violet;
--warning: amber;
--success: green;
```

Style direction:

- Dark-first interface.
- High contrast text.
- Restrained accent usage.
- Compact cards.
- Thin borders.
- Clear status treatments.
- Evidence and uncertainty visibly separated from assertions.
- Report categories rendered as a compact accordion stack with at most one open panel.

Use a system-safe sans font stack unless an approved Torq font asset becomes available.

## Local verification plan

### Single-company smoke test

- Enter one known company.
- Confirm its primary official homepage is ranked first.
- Confirm research remains paused until the candidate is explicitly selected.
- Generate one report.
- Confirm one UUID.
- Confirm one LangSmith trace.
- Open every source link.
- Verify report claims have evidence badges.

### Ambiguous-company test

- Enter a deliberately ambiguous name.
- Confirm multiple candidates appear.
- Select one candidate.
- Confirm only the selected company reaches the research graph.

### Manual-or-discard test

- Use a name with no confident match.
- Confirm a valid manually entered website becomes the selected company.
- Confirm discarding a company marks it decided without sending it to the research graph.

### Five-company test

- Enter five tags.
- Confirm five independent graph executions.
- Confirm five reports.
- Confirm five UUIDs.
- Confirm five LangSmith traces.
- Confirm one failure does not remove successful reports.

### Weak-data test

- Use a company with a small public footprint.
- Confirm gaps are shown.
- Confirm the report does not fabricate confidence.

### Provider-failure test

- Test invalid or missing provider credentials.
- Confirm a clear failure state.
- Confirm no secret is visible in the browser.

## Testing strategy

Add tests only around behavior that protects the contracts:

- Tag parsing, trimming, deduplication, and maximum count.
- Zod contract acceptance and rejection.
- Grounding validation.
- Source/evidence ID integrity.
- Company-resolution status handling.
- Exact-domain resolution, unique plausible-name resolution, and ambiguous partial-name handling.
- Primary-homepage ranking, mandatory confirmation, manual-site validation, and discard handling.
- Few-shot LLM identity ranking with immutable candidate references and a raw-title regression case.
- Partial batch failure handling.
- One-company/one-research-ID execution.
- Fragmented newline-delimited progress stream parsing.
- Event-driven progress rendering without activity-log output.
- Node-specific Tavily query/depth/recency/domain/score plans and Firecrawl map/scrape options.
- Named-technology specificity, one-source selection, deduplication, and Torq-inference boundaries.
- Report minimums of 1–3 pain-point hypotheses and exactly 2–3 talking points.

Provider calls should be mocked for deterministic contract tests. At least one live local smoke test must use the real Tavily, Firecrawl, LLM, and LangSmith integrations.

## Documentation and submission artifacts

Create `README.md` with:

- Product overview.
- Local prerequisites.
- Install and run commands.
- Environment variable setup.
- Architecture summary.
- Node responsibilities.
- Grounding model.
- LangSmith tracing instructions.
- Known limitations.

Create `sample-report.md` from a real local run. It must contain actual source links and reflect the product's rendered report structure.

## Completion criteria for the local milestone

The local milestone is complete when:

- The app runs from a clean checkout with documented commands.
- A non-technical user can complete the full flow without instructions.
- One to five company names or domains can be entered as tags.
- Every company requires an explicit candidate, manual-site, or discard decision before research starts.
- Every report claim is evidence-backed.
- Every report contains clickable source links.
- Five companies produce five reports, five UUIDs, and five traces.
- Partial failures are handled without losing successful results.
- Confidence and gaps are visible.
- No secrets reach the client.
- The README and sample report are complete.

## Deployment decision gate

After the local milestone passes, decide whether deployment adds value for the presentation.

If deployment is approved later, evaluate:

- Vercel environment variables.
- Serverless function execution duration.
- Tavily and Firecrawl rate limits.
- LangSmith trace completion in a serverless runtime.
- Whether Level 1's stateless behavior is sufficient for the deployed demo.
- Custom domain configuration only after the deployment itself is verified.

No deployment work should begin until the local acceptance criteria above are met.
