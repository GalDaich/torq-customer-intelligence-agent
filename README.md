# Torq Customer Intelligence Agent

A Level 1 customer-research tool for AEs and CSMs. It researches one to five companies from public sources and turns the findings into cited, Torq-relevant account briefs.

Live demo: [torq-demo.galdaich.com](https://torq-demo.galdaich.com)

## What it does

- Accepts company names and finds likely official websites.
- Normalizes and ranks discovered company candidates without allowing the model to change their IDs, domains, URLs, or source lineage.
- Waits for the user to confirm each company before spending research credits.
- Researches company context, company developments, hiring, security signals, and named technologies.
- Uses broad public-web evidence without a hard date window, score threshold, or source-type rejection policy.
- Checks the company's own blog, newsroom, and press-release items alongside wider web results.
- Produces a separate cited report for each company.
- Preserves known dates and uncertainty while still producing useful evidence-informed hypotheses and talking points.

## Run it locally

You need Node.js 20.9 or newer, npm, and API keys for OpenAI, Tavily, Firecrawl, and LangSmith.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill in `.env.local`, then open [http://localhost:3000](http://localhost:3000). The keys remain server-side and the file is ignored by Git.

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Identity normalization, evidence classification, and synthesis |
| `OPENAI_MODEL` | Exact OpenAI model used for structured output |
| `TAVILY_API_KEY` | Company discovery and focused public-web searches |
| `FIRECRAWL_API_KEY` | Confirmed official-site mapping and scraping |
| `LANGSMITH_TRACING=true` | Enables required model and graph traces |
| `LANGSMITH_API_KEY` | Authenticates LangSmith |
| `LANGSMITH_PROJECT` | Groups the application's traces |
| `LANGSMITH_ENDPOINT` | LangSmith API endpoint for the selected region |
| `LANGCHAIN_CALLBACKS_BACKGROUND=false` | Waits for LangChain trace updates before a serverless run finishes |
| `LANGSMITH_TRACING_BACKGROUND=false` | Prevents pending LangSmith batches from being abandoned by the runtime |

## Commands

```bash
npm run dev        # start the development server
npm run check      # lint, type-check, and run all deterministic tests
npm run build      # create the optimized production build
npm start          # serve the production build
```

## Demo evidence policy

Company identity remains the strict first boundary. The model may clean display names, improve neutral descriptions, and rank discovered candidates, but deterministic code preserves the candidate set and every candidate ID, domain, website URL, and source ID. Ambiguous matches still require an explicit user choice before research begins.

Downstream research is intentionally permissive for this home-assignment demo. Relevant public evidence may be used whether it is old, undated, syndicated, aggregated, or returned with a low provider score. Dates and source quality remain visible context for the reader rather than eligibility gates. Retrieval still removes empty content and exact duplicate URLs or excerpts so repeated provider results do not clutter the report.

The final deterministic boundary is lineage, not editorial quality: every visible factual claim must cite retrieved evidence that resolves to a retained source URL. A broken or invented evidence reference removes only the affected finding when possible; it does not erase other valid sections. Pain points and talking points remain explicitly labeled, evidence-informed hypotheses rather than asserted internal facts.

## Scope

I kept this submission to Level 1. There is no account system, database, watchlist, scheduled refresh, or change feed. Company selections live in the browser and disappear on refresh.

The research flow uses bounded Tavily searches and targeted Firecrawl extraction. LangGraph keeps each company's research independent, OpenAI handles structured analysis and synthesis, and successful companies survive failures elsewhere in the batch. Model attempts do not retry, final synthesis falls back to cited specialist findings after its deadline, and the whole company run stops safely before Vercel's function limit.

The two additional submission files are:

- [Validated live-run Datadog sample](./docs/SAMPLE-REPORT.md)
- [Short build and architecture note](./docs/SUBMISSION-NOTE.md)
