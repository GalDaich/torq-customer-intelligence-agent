# Current implementation contracts

This document describes the code that exists now. It replaces the earlier build plan, which mixed completed design decisions with historical implementation steps.

## Scope

Implemented: the assignment's required Level 1 on-demand company research product.

Intentionally deferred: Level 2 watchlists, persistence, comparison between runs, change feeds, refresh scheduling, authentication, and background queues.

The optional hosted bonus is deployed at [torq-demo.galdaich.com](https://torq-demo.galdaich.com). The same application remains runnable locally with reviewer-supplied keys.

## Core contracts

- Accept one to five unique company names or domains.
- Resolve every submitted name before research.
- Require an explicit candidate, manual-site, or discard decision for every row.
- Give every company its own UUID and independent graph run.
- Run first-party, recent, hiring, security, and technology specialists in parallel.
- Keep prompts in `prompts/`; no model-authored search plans or inline runtime prompts.
- Normalize all provider material to typed Source and Evidence records.
- Pass only specialist-selected lineage to synthesis.
- Validate all rendered claims against retained evidence and public source URLs.
- Keep successful peer reports when another company fails.
- Stream real graph events and do not retain a browser activity log.
- Produce honest partial reports and visible gaps; never manufacture fallback findings.

## Provider and cost bounds

### Tavily

- One Basic company-resolution search per company.
- Two recent-signal searches, two hiring searches, two security searches, and three technology searches.
- Advanced depth is used for broad discovery; Basic depth is used for precise official-domain, incident-news, and named-tool searches.
- Result counts, score thresholds, time windows, and aggregator exclusions are fixed in `lib/research-plans.ts`.
- The deterministic research ceiling is 14 Tavily credits plus one Basic resolution credit per company.

### Firecrawl

- Map at most five same-domain URLs.
- Scrape the confirmed homepage plus at most two focused company/product/platform/solution/about pages.
- Allow at most two concurrent Firecrawl requests.
- Pace map and scrape starts independently to ten per minute each.
- Use a one-day provider cache window where supported.

Do not silently raise these limits. Tune query allocation or evidence thresholds deliberately and document any cost change.

## LLM responsibilities

1. Candidate identity cleanup and ranking.
2. First-party company/product extraction.
3. Recent-event classification.
4. Hiring-signal classification.
5. Security-signal classification.
6. Named-technology classification.
7. Final report synthesis.

The LLM does not choose search queries, create provider URLs, authorize research, or perform final grounding validation.

## Report contract

Every report contains:

- research UUID and confirmed company identity;
- a plain-language company description when supported;
- recent, hiring, security, and technology signals when supported;
- zero to three evidence-backed pain-point hypotheses;
- zero to three evidence-backed talking points (normally two or three when evidence is sufficient);
- one to six confidence/gap bullets;
- only sources and evidence cited by retained visible claims.

Weak evidence is allowed to produce an empty category. Quota-filling with generic content is not.

## Verification status

Deterministic unit/contract tests and the optimized production build are the normal local verification gate. One credential-backed HiBob run completed all graph stages and is preserved in `SAMPLE-REPORT.md`.

Production verification on 2026-08-01 covered HTTPS/domain routing, the rendered UI, HiBob resolution, explicit official-site selection, one complete streamed graph, the company report tab, citations, and accordion interaction. The hosted run used research ID `9abac055-67e1-4df7-bd3c-9e64e4eac53f`; Vercel reported no runtime error clusters during verification.

Before claiming the entire live matrix, still verify five-company execution, manual/discard/restore flows, weak-data and partial-provider cases, exhaustive source links, duplicate suppression, and matching LangSmith traces. These are live acceptance items, not facts proven by unit tests.

A fresh `npm audit` was attempted on 2026-08-01 but could not reach the npm registry from the approved environment. Dependency advisories therefore remain unverified and should be reviewed before final submission or longer-lived public operation.

## Known limitations

- Browser session state is lost on refresh.
- A batch uses one long-lived HTTP request with an NDJSON response stream.
- Firecrawl mapping can miss pages that are absent from navigation and sitemaps.
- Provider rate limits and latency become visible in multi-company batches.
- Free-tier pacing may intentionally carry a five-company batch across minute boundaries.
- The included sample proves one company run, not the pending full acceptance matrix.
