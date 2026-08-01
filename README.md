# Torq Customer Intelligence Agent

A local-first Level 1 product that researches one to five companies from public sources and turns the evidence into readable, Torq-relevant account intelligence for an AE or CSM.

The product accepts company names in a browser, asks the user to confirm each official website, runs an independent research graph per confirmed company, and renders cited reports with honest confidence gaps. It intentionally does not implement the assignment's optional Level 2 watchlist and change-detection features.

**Live bonus deployment:** [torq-demo.galdaich.com](https://torq-demo.galdaich.com)

## Run it locally

Prerequisites: Node.js 20.9 or newer, npm, and API keys for OpenAI, Tavily, Firecrawl, and LangSmith.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill in `.env.local`, then open [http://localhost:3000](http://localhost:3000). Provider credentials stay server-side and `.env.local` is ignored by Git.

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

## Useful commands

```bash
npm run dev        # start the development server
npm run check      # lint, type-check, and run all deterministic tests
npm run build      # create the optimized production build
npm start          # serve the production build
```

## Current status

- Level 1 implementation: complete.
- Deterministic verification: covered by the repository test suite and production build.
- Credential-backed sample: one successful HiBob run is preserved in [docs/SAMPLE-REPORT.md](./docs/SAMPLE-REPORT.md).
- Hosted verification: the production resolver, confirmation step, streamed graph, report tab, citations, and accordion completed successfully on 2026-08-01.
- Still pending before claiming full live acceptance: the complete one-to-five-company matrix, deliberately weak/failing provider cases, and matching LangSmith/source-link review.
- Dependency advisory refresh: attempted on 2026-08-01, but npm registry egress was unavailable; no current advisory result is claimed.
- Deployment: the optional Vercel bonus is live; local setup remains fully supported with the reviewer's own API keys.

## Documentation

All supporting documentation lives in [`docs/`](./docs/):

- [Documentation index](./docs/README.md)
- [How the product works](./docs/HOW-IT-WORKS.md)
- [Architecture map](./docs/ARCHITECTURE.md)
- [Complete repository map](./docs/REPO-MAP.md)
- [Current implementation contracts](./docs/CURRENT-IMPLEMENTATION.md)
- [Assignment and deliverables coverage](./docs/ASSIGNMENT-COVERAGE.md)
- [Developer onboarding guide](./docs/DEVELOPMENT.md)
- [Deployment and operations guide](./docs/DEPLOYMENT.md)
- [Prompt modules](./docs/PROMPTS.md)
- [Half-page submission note](./docs/SUBMISSION-NOTE.md)
- [Generated sample report](./docs/SAMPLE-REPORT.md)

The root README remains intentionally short because the assignment specifically asks for run instructions alongside the code. The detailed onboarding material is kept in `docs/`.
