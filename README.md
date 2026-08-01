# Torq Customer Intelligence Agent

A local-first Level 1 browser product for researching one to five companies from public sources and turning the evidence into concise, Torq-relevant customer intelligence.

The implementation is complete through deterministic tests, production build, browser verification, and initial credential-backed user testing. The full one-to-five-company acceptance matrix and trace review remain pending. Deployment is out of scope until that local gate passes.

## What the product does

1. Accepts one to five company names or domains as removable tags.
2. Searches for plausible official company identities and prefers an exact domain match.
3. Uses a strict LLM normalization step to turn raw page titles such as `Join monday.com` into a clean grounded identity such as `monday.com`.
4. Continues automatically for a single match and requires human selection only when multiple plausible matches remain.
5. Runs one independent LangGraph execution per selected company.
6. Collects first-party, recent, hiring, and security evidence while rejecting generic index and careers pages.
7. Uses an LLM to classify evidence and passes only node-selected lineage into final synthesis.
8. Deterministically rejects unsupported, uncited, generic, and duplicate evidence, including the same job repeated across sources.
9. Returns successful company reports even when another company fails.
10. Streams real graph-stage progress to the browser without retaining or displaying a run log.
11. Presents completed reports as a company launchpad and opens each full report in its own company-named browser tab with a single-open category stack.

## Local prerequisites

- Node.js 20.9 or newer. The current workspace was verified with Node.js 26.5.1.
- npm.
- Tavily, Firecrawl, OpenAI Platform, and LangSmith accounts and API keys.

## Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Secrets belong only in `.env.local`. That file is ignored by Git. No environment variable uses a `NEXT_PUBLIC_` prefix, and all provider authorization headers are created inside server-only route handlers.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | Authenticates identity normalization, evidence classification, and report synthesis. |
| `OPENAI_MODEL` | Yes | Exact OpenAI model ID to use for strict structured output. |
| `TAVILY_API_KEY` | Yes | Company resolution and focused public-signal searches. |
| `FIRECRAWL_API_KEY` | Yes | Targeted official website and product-page scraping. |
| `LANGSMITH_TRACING` | Yes; must be `true` | Enables trace creation for identity normalization and every company graph invocation. |
| `LANGSMITH_API_KEY` | Yes | Authenticates LangSmith tracing. |
| `LANGSMITH_PROJECT` | Yes | Project used to group and find research traces. This build uses `torq-customer-intelligence-agent`. |
| `LANGSMITH_ENDPOINT` | Yes | LangSmith API base URL for the workspace region; use `https://eu.api.smith.langchain.com` for an EU workspace. |

The app checks this environment contract before identity normalization or research begins. Missing keys produce a visible error; invalid provider authentication is not downgraded to a weak-evidence result.

## Commands

```bash
npm run dev       # local development server
npm run check     # lint, TypeScript, and focused contract tests
npm run build     # optimized production build
npm start         # serve the completed production build
```

## Architecture

The product is one Next.js App Router TypeScript application. The browser owns only input, human selection, and report rendering. Route handlers own provider credentials and external requests.

Each selected company gets its own UUID and graph invocation:

```text
firstPartyContext ─┐
recentSignals ─────┤
hiringSignals ─────┼─> synthesizeReport -> validateReport
securitySignals ───┘
```

The four research nodes run in parallel. They use fixed search patterns or fixed first-party page targets; the LLM cannot author queries. Each node passes only the evidence IDs selected in its typed output into synthesis, so omitted raw search results cannot be reintroduced later. The final validation node has no LLM.

Every LLM instruction lives in its own editable TypeScript module under `prompts/`. The graph and normalization code contain no inline system or user prompts.

Before selection or automatic continuation, discovery candidates pass through one strict structured-output identity-normalization call. The model can rewrite only the candidate's display name and neutral description. Deterministic code requires exactly the discovered candidate IDs and retains their domains, website URLs, and source IDs unchanged. Invalid or failed normalization stops resolution; raw search-page titles are not silently used as final company identities. This pre-graph call has its own `normalize_company_identity` LangSmith run, normalization tags, and the same `research:<researchId>` correlation tag used by the later graph.

For every company, `researchId` is preserved through resolution, selection, graph state, progress events, the final report, LangGraph `thread_id`, LangSmith metadata, and a `research:<researchId>` tag. Independent company runs execute concurrently with guarded outcomes, so one failure does not remove successful peers.

The research route responds as newline-delimited JSON. Each LangGraph task start, completion, or failure is streamed as a typed progress event before the final batch result. The progress bar is derived only from those server events; it does not use estimated timers.

## Observability

- The progress panel shows the current graph stage, per-company stage state, and percentage complete while research is running.
- The app does not render a browser run log or emit its own structured backend, provider, or model logs.
- LangSmith remains the detailed trace system for identity normalization, graph execution, and model calls.

## Grounding model

Search and scraping code creates normalized `Source` and `Evidence` records. Raw provider payloads do not cross that boundary. Evidence excerpts come only from returned search content or scraped Markdown.

Every rendered report claim must satisfy:

```text
claim -> evidence ID -> source ID -> real clickable URL
```

Retrieval removes generic careers, jobs, newsroom, and index pages where they cannot support a specific finding. Corpus merging canonicalizes URLs and removes repeated excerpts. After classification, only node-selected evidence proceeds to synthesis; after synthesis, only cited lineage proceeds to validation and the UI.

The LLM can output only existing evidence IDs. It cannot output source objects, URLs, titles, or excerpts. `validateGroundedReport` checks strict Zod contracts, unique canonical URLs and excerpts, evidence-to-source integrity, complete citation coverage, one strongest source per hiring role, and duplicate job identities. Invalid output is rejected; no deterministic fallback report is manufactured.

## LangSmith verification

After a real run:

1. Open the project named by `LANGSMITH_PROJECT`.
2. Filter for the `customer-intelligence` tag.
3. Search a visible report UUID with `research:<researchId>`.
4. Confirm the pre-graph `normalize_company_identity` run has the `identity-normalization` tag and matching research metadata.
5. Confirm each submitted company has a separate graph trace and matching metadata for company name and domain.

Five submitted companies should create five UUIDs and five independently searchable executions. The batch request itself is not a graph invocation.

## Local acceptance run

Once all credentials are populated, verify:

- One known company resolves, researches, and renders with clickable claim badges.
- An ambiguous company shows multiple candidates and blocks research until selection.
- Five companies return five visible UUIDs and five LangSmith traces.
- One deliberately failed company does not remove successful reports.
- A company with weak public evidence shows gaps rather than invented certainty.
- Invalid Tavily, Firecrawl, OpenAI, and LangSmith credentials produce honest failure states.
- Every source badge opens its corresponding public URL.
- Duplicate versions of the same job appear once and cite one strongest item-specific source.
- Generic careers and index pages never appear as report evidence.
- Report categories start closed and opening one closes the previously open category.

Only after this live run passes should `sample-report.md` be replaced with the actual output and deployment be considered.

## Known limitations

- No persistence, authentication, watchlist, scheduling, or change detection.
- Human resolution state is held in the browser and is lost on refresh.
- The fixed `/products` first-party path will not exist for every company; that miss appears as a gap.
- Research uses one long-lived HTTP request per batch and streams newline-delimited progress events while it runs.
- The progress stream is transient UI state and is not retained as activity history.
- Provider rate limits and latency affect one-to-five company batches.
- `sample-report.md` is pending a real credential-backed run.
- A fresh npm advisory audit was blocked in this environment. The install reported three high-severity findings in the full dependency tree; re-run `npm audit` in an approved environment and review findings before deployment.

## Scope authority

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for the fixed contracts, product states, grounding requirements, and deployment gate.
