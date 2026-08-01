# Build note

## Why I chose this stack

I built the product as one Next.js application so the UI and server-side provider calls stay in the same project. The browser handles company input, website confirmation, progress, and report display. API keys and external requests stay in server routes.

Each confirmed company gets its own LangGraph run. Five research steps run in parallel: company context, recent events, hiring, security signals, and named technologies. Tavily handles focused web search, while Firecrawl extracts a small number of pages from the confirmed company site. OpenAI classifies the evidence and writes the final report. LangSmith is used to inspect the model and graph runs.

I did not rely on the model alone for grounding. The code checks that every cited claim points to evidence returned by the research tools and that the evidence points to a real source URL. It also removes unsupported or repeated findings.

## What I would add with another week

I would test a wider mix of companies, tune the searches from those traces, and add the optional Level 2 watchlist with stored reports and real change detection. I would also move longer research jobs out of a single browser request.

## Where AI helped

I used AI coding tools to speed up implementation, tests, prompt iteration, and code review. I made the product and scope decisions, chose the provider boundaries, reviewed the UX, and rejected research outputs that sounded useful but were not supported well enough.
