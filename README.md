# Torq Customer Intelligence Agent

A local-first Level 1 browser product for researching one to five companies from public sources and turning the evidence into concise, Torq-relevant customer intelligence.

The implementation is complete through deterministic tests, production build, and credential-failure browser verification. A live Tavily + Firecrawl + OpenAI + LangSmith smoke test is intentionally pending until real credentials are added. Deployment is out of scope until that local gate passes.

## What the product does

1. Accepts one to five company names or domains as removable tags.
2. Searches for plausible official company identities and prefers an exact domain match.
3. Continues automatically for a single match and requires human selection only when multiple plausible matches remain.
4. Runs one independent LangGraph execution per selected company.
5. Collects first-party, recent, hiring, and security evidence.
6. Uses an LLM to classify evidence and synthesize the final report.
7. Deterministically rejects unsupported evidence references.
8. Returns successful company reports even when another company fails.
9. Streams real graph-stage progress to the browser and records a timestamped run log.

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
| `OPENAI_API_KEY` | Yes | Authenticates evidence classification and report synthesis. |
| `OPENAI_MODEL` | Yes | Exact OpenAI model ID to use for strict structured output. |
| `TAVILY_API_KEY` | Yes | Company resolution and focused public-signal searches. |
| `FIRECRAWL_API_KEY` | Yes | Targeted official website, product, and careers-page scraping. |
| `LANGSMITH_TRACING` | Yes; must be `true` | Enables trace creation for every company graph invocation. |
| `LANGSMITH_API_KEY` | Yes | Authenticates LangSmith tracing. |
| `LANGSMITH_PROJECT` | Yes | Project used to group and find research traces. This build uses `torq-customer-intelligence-agent`. |
| `LANGSMITH_ENDPOINT` | Yes | LangSmith API base URL for the workspace region; use `https://eu.api.smith.langchain.com` for an EU workspace. |

The app checks this environment contract before research begins. Missing keys produce a visible error; invalid provider authentication is not downgraded to a weak-evidence result.

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

The four research nodes run in parallel. They use fixed search patterns or fixed first-party page targets; the LLM cannot author queries. Their typed outputs converge at synthesis. The final validation node has no LLM.

For every company, `researchId` is preserved through resolution, selection, graph state, progress events, backend logs, the final report, LangGraph `thread_id`, LangSmith metadata, and a `research:<researchId>` tag. Independent company runs execute concurrently with guarded outcomes, so one failure does not remove successful peers.

The research route responds as newline-delimited JSON. Each LangGraph task start, completion, or failure is streamed as a typed progress event before the final batch result. The progress bar and browser activity log are derived only from those server events; they do not use estimated timers.

## Observability

- The progress panel shows the current graph stage, per-company stage state, percentage complete, timestamps, and measured stage duration.
- Server routes, provider calls, graph stages, and batch boundaries emit one structured JSON log line per event.
- `batchId`, `researchId`, company name, stage, provider operation, status, and duration provide correlation across the browser log, terminal output, and LangSmith.
- Logs intentionally exclude API keys, provider payloads, evidence excerpts, prompts, and report content.
- LangSmith remains the detailed trace system for graph and model execution. Local JSON logs explain application and provider boundaries around those traces.

## Grounding model

Search and scraping code creates normalized `Source` and `Evidence` records. Raw provider payloads do not cross that boundary. Evidence excerpts come only from returned search content or scraped Markdown.

Every rendered report claim must satisfy:

```text
claim -> evidence ID -> source ID -> real clickable URL
```

The LLM receives bounded sources and evidence but can output only existing evidence IDs. It cannot output source objects, URLs, titles, or excerpts. `validateGroundedReport` checks strict Zod contracts, unique IDs, evidence-to-source integrity, and every claim citation. Invalid output is rejected; no deterministic fallback report is manufactured.

## LangSmith verification

After a real run:

1. Open the project named by `LANGSMITH_PROJECT`.
2. Filter for the `customer-intelligence` tag.
3. Search a visible report UUID with `research:<researchId>`.
4. Confirm each submitted company has a separate graph trace and matching metadata for company name and domain.

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

Only after this live run passes should `sample-report.md` be replaced with the actual output and deployment be considered.

## Known limitations

- No persistence, authentication, watchlist, scheduling, or change detection.
- Human resolution state is held in the browser and is lost on refresh.
- Fixed `/products` and `/careers` first-party paths will not exist for every company; those misses appear as gaps.
- Research uses one long-lived HTTP request per batch and streams newline-delimited progress events while it runs.
- Browser activity history is held only for the current flow, and backend JSON logs go only to the current server log destination; persistence and centralized log aggregation are deferred.
- Provider rate limits and latency affect one-to-five company batches.
- `sample-report.md` is pending a real credential-backed run.
- A fresh npm advisory audit was blocked in this environment. The install reported three high-severity findings in the full dependency tree; re-run `npm audit` in an approved environment and review findings before deployment.

## Scope authority

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for the fixed contracts, product states, grounding requirements, and deployment gate.
