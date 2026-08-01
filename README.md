# Torq Customer Intelligence Agent

A Level 1 customer-research tool for AEs and CSMs. It researches one to five companies from public sources and turns the findings into cited, Torq-relevant account briefs.

Live demo: [torq-demo.galdaich.com](https://torq-demo.galdaich.com)

## What it does

- Accepts company names and finds likely official websites.
- Waits for the user to confirm each company before spending research credits.
- Researches company context, recent events, hiring, security signals, and named technologies.
- Produces a separate cited report for each company.
- Shows missing or weak evidence as a gap instead of filling it with a generic answer.

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

## Commands

```bash
npm run dev        # start the development server
npm run check      # lint, type-check, and run all deterministic tests
npm run build      # create the optimized production build
npm start          # serve the production build
```

## Scope

I kept this submission to Level 1. There is no account system, database, watchlist, scheduled refresh, or change feed. Company selections live in the browser and disappear on refresh.

The research flow uses bounded Tavily searches and targeted Firecrawl extraction. LangGraph keeps each company's research independent, OpenAI handles structured analysis and synthesis, and deterministic validation checks that report claims point back to retrieved evidence and real source URLs.

The two additional submission files are:

- [Sample HiBob report](./docs/SAMPLE-REPORT.md)
- [Short build and architecture note](./docs/SUBMISSION-NOTE.md)
