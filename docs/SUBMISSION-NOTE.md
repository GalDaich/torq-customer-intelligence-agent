# Build note

## Why I chose this stack

One Next.js application keeps the UI and provider calls together. The browser handles company input, confirmation, progress, and reports. API keys and external requests stay server-side.

Each confirmed company gets its own LangGraph run. Five research steps run in parallel. The research is intentionally broad for the home-assignment demo: there is no hard publication window, provider-score cutoff, or rejection of generic public sources. The recent-signals step also checks the company's own blog, newsroom, and press releases.

Tavily searches, Firecrawl extracts pages, and OpenAI classifies evidence and writes the report. Model calls have bounded, no-retry timeouts; failed final synthesis returns cited specialist findings instead of losing the run. LangSmith callbacks finish synchronously on the serverless path. Final validation checks every claim-to-evidence-to-source path and removes only findings whose evidence references do not exist.

## What I would add with another week

I would test a wider mix of companies, tune the searches from those traces, and add the optional Level 2 watchlist with stored reports and real change detection. I would also move longer research jobs out of a single browser request.

## Where AI helped

I used AI coding tools for implementation, tests, prompt iteration, and review. I made the product and scope decisions, chose the provider boundaries, reviewed the UX, and rejected research outputs that sounded useful but were not supported well enough.
