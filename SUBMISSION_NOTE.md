# Architecture and build note

The product is a local-first Next.js application because the assignment needs a browser experience for non-technical account executives and CSMs, but does not justify separate services or deployment infrastructure. The browser owns company input, mandatory identity confirmation, progress, and report presentation. Server route handlers keep provider credentials private and separate company resolution from research authorization.

Each confirmed company receives a UUID and an independent LangGraph run. Five parallel specialists research first-party context, recent events, hiring, explicit security signals, and named technologies. Firecrawl maps and scrapes a small set of high-value pages on the confirmed official site; Tavily performs bounded, node-specific open-web searches. Specialist LLM calls select typed evidence, and a separate synthesis call writes the report. Deterministic code then validates every claim-to-evidence-to-source path, rejects generic or duplicate evidence, and never manufactures fallback findings.

I chose this composition because it is easy to explain and inspect: Next.js provides the product surface and server boundary, Tavily handles discovery, Firecrawl handles page extraction, LangGraph makes parallel research and traceable stages explicit, OpenAI provides structured analysis, and LangSmith provides model/graph observability without application logging.

With another week, I would complete the full live acceptance matrix, tune retrieval from observed traces, add persisted Level 2 watchlists and real change detection, and evaluate a durable background execution model before deployment.

AI coding tools accelerated implementation, test generation, prompt review, and documentation. Human judgment remained responsible for scope, provider roles, evidence quality, Torq relevance boundaries, UX decisions, and rejecting outputs that looked plausible but were not sufficiently grounded.
