# Build note

## Why I chose this stack

One Next.js application keeps the UI and provider calls together. The browser handles company input, confirmation, progress, and reports. API keys and external requests stay server-side.

Company resolution is deliberately stricter than research. The normalization model may improve candidate display text and ranking, while deterministic code preserves the complete discovered candidate set and every candidate ID, domain, website URL, and source ID. Research starts only after the user confirms one candidate, enters a website manually, or discards the input.

Each confirmed company gets its own LangGraph run, with five research steps running in parallel. The downstream policy is intentionally broad for the home-assignment demo: there is no hard publication window, provider-score cutoff, aggregator exclusion, or generic-source rejection. Dates and source quality are preserved as reader context. The searches remain bounded and purpose-specific, while corpus normalization removes unreadable empty content and canonical duplicate URLs or excerpts.

Tavily searches, Firecrawl extracts pages, and OpenAI classifies evidence and writes the report. Model calls have bounded, no-retry timeouts; failed final synthesis returns cited specialist findings instead of losing the run. LangSmith callbacks finish synchronously on the serverless path. Final validation preserves schema-valid findings with at least one complete claim-to-evidence-to-source path and drops only findings with broken lineage when possible.

## Verification

The validated Datadog sample run completed the research graph and produced 6 recent signals, 7 hiring signals, 5 security signals, 7 technology signals, 3 pain-point hypotheses, 3 talking points, 26 sources, and 27 evidence records. Its checked-in report is rendered directly from successful LangSmith trace `019fbf2b-fb4d-77f4-9268-0aee368cb694`, with every visible claim resolving through evidence to a source. The deterministic suite passed 70 tests, and the production build completed successfully.

## What I would add with another week

I would test a wider mix of companies, tune the searches from those traces, and add the optional Level 2 watchlist with stored reports and real change detection. I would also move longer research jobs out of a single browser request.

## Where AI helped

I used AI coding tools for implementation, tests, prompt iteration, and review. I made the product and scope decisions, chose the provider boundaries, reviewed the UX, and retained deterministic controls for company identity, structured contracts, and claim-to-source lineage.
