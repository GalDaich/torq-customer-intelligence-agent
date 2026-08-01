# Architecture and build note

The product is a Next.js application, runnable locally and deployed on Vercel, because the assignment needs a browser experience for non-technical AEs and CSMs without separate services. The browser owns company input, mandatory identity confirmation, progress, and report presentation. Server routes keep credentials private and separate company discovery from research authorization.

Each confirmed company receives a UUID and an independent LangGraph run. Five parallel specialists research first-party context, recent events, hiring, explicit security signals, and named technologies. Firecrawl extracts a small set of pages from the confirmed site; Tavily performs bounded open-web searches. Specialist LLM calls select typed evidence, and a separate synthesis call writes the report. Deterministic code then validates every claim-to-evidence-to-source path, rejects generic or duplicate evidence, and never manufactures fallback findings.

This composition is easy to explain and inspect: Next.js provides the product and server boundary, Tavily handles discovery, Firecrawl handles extraction, LangGraph makes parallel stages explicit, OpenAI provides structured analysis, and LangSmith provides observability without application logging.

With another week, I would finish the complete live acceptance matrix, tune retrieval from observed traces, add persisted Level 2 watchlists and real change detection, and evaluate durable background execution beyond the current demo.

AI coding tools accelerated implementation, test generation, prompt review, and documentation. Human judgment remained responsible for scope, provider roles, evidence quality, Torq relevance boundaries, UX decisions, and rejecting outputs that looked plausible but were not sufficiently grounded.
