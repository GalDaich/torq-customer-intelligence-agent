# Build note

## Why I chose this stack

I built the product as one Next.js application so the UI and server-side provider calls stay in the same project. The browser handles company input, website confirmation, progress, and report display. API keys and external requests stay in server routes.

Each confirmed company gets its own LangGraph run. Five research steps run in parallel: company context, recent events, hiring, security signals, and named technologies. The run calculates today in UTC and one calendar year earlier, then gives that exact window to every search and prompt. Undated or out-of-window sources are removed in code. The recent-signals step also checks the company's own blog, newsroom, and press releases for dated items.

Tavily searches the web, Firecrawl extracts pages, OpenAI classifies evidence and writes the report, and LangSmith exposes the model and graph runs. Final code validation checks every claim-to-evidence-to-source path and removes unsupported or repeated findings.

## What I would add with another week

I would test a wider mix of companies, tune the searches from those traces, and add the optional Level 2 watchlist with stored reports and real change detection. I would also move longer research jobs out of a single browser request.

## Where AI helped

I used AI coding tools to speed up implementation, tests, prompt iteration, and code review. I made the product and scope decisions, chose the provider boundaries, reviewed the UX, and rejected research outputs that sounded useful but were not supported well enough.
