# Complete repository map

This map describes the tracked repository and the generated/local-only folders you may see after setup. Start with `README.md`, then use this file when you need to locate an implementation detail.

## Root files

| Path | What it does |
| --- | --- |
| `.env.example` | Lists every required server-only environment variable without containing secrets |
| `.gitignore` | Excludes dependencies, builds, coverage, local environment files, logs, macOS metadata, and TypeScript build metadata |
| `.vercelignore` | Prevents local agent tooling, secrets, dependencies, and generated output from entering deployment uploads |
| `README.md` | Short project entry point, local run instructions, current status, and documentation links |
| `eslint.config.mjs` | Applies Next.js Core Web Vitals and TypeScript lint rules while ignoring generated output |
| `next-env.d.ts` | Next.js-generated TypeScript declarations; do not edit manually |
| `next.config.ts` | Next.js configuration; currently uses framework defaults |
| `package.json` | Project identity, development/verification commands, runtime dependencies, and development dependencies |
| `package-lock.json` | Exact npm dependency graph for reproducible installs |
| `tsconfig.json` | Strict TypeScript, JSX, module resolution, path alias, and Next.js plugin settings |
| `vitest.config.mjs` | Vitest configuration and the `@/` root import alias |

## `app/` — Next.js routes and global presentation

| Path | What it does |
| --- | --- |
| `app/layout.tsx` | Root HTML layout, page metadata, and global stylesheet import |
| `app/page.tsx` | Home route that renders the research workspace |
| `app/globals.css` | Design tokens and all workspace, confirmation, progress, launchpad, report, and responsive styles |
| `app/api/resolve/route.ts` | Validates company input, checks the resolution environment, resolves candidates concurrently, and returns typed JSON errors/results |
| `app/api/research/route.ts` | Validates confirmed companies, starts one graph per company, streams typed NDJSON progress, and preserves successful peer reports |
| `app/api/research/route.test.ts` | Verifies independent-company failure isolation and real progress/complete stream events |

## `components/` — browser workflow and report UI

| Path | What it does |
| --- | --- |
| `components/research-workspace.tsx` | Owns the five browser phases: input, resolving, confirmation, researching, and results |
| `components/company-tag-input.tsx` | Turns typed, comma-separated, or pasted names into deduplicated removable tags with a five-company cap |
| `components/company-tag-input.test.ts` | Verifies token parsing, deduplication, overflow reporting, and accessible rendering |
| `components/company-resolution.tsx` | Renders discovered candidates plus manual website, discard, and restore controls |
| `components/company-resolution.test.tsx` | Verifies confirmation requirements and manual/discard presentation states |
| `components/research-progress.tsx` | Derives batch percentage and per-company stage status from streamed graph events |
| `components/research-progress.test.tsx` | Verifies real-event progress, active-stage messaging, and failure styling contracts |
| `components/report-launchpad.tsx` | Opens each completed company report in a separate named browser tab and reports pop-up failures |
| `components/company-report.tsx` | Renders the single-open accordion, empty categories, claim citations, sources, and confidence gaps |
| `components/company-report.test.tsx` | Verifies report rendering, source badges, launch card behavior, and safety-related empty states |

## `lib/` — domain contracts, provider adapters, and graph logic

| Path | What it does |
| --- | --- |
| `lib/schemas.ts` | Central Zod contracts for companies, evidence, specialist findings, reports, requests, responses, stages, and streamed events |
| `lib/company-normalization.ts` | Uses structured LLM output to rank/clean only discovered candidate IDs and creates correlated trace metadata |
| `lib/company-normalization.test.ts` | Verifies candidate-set preservation, trace correlation, ordering, and failure boundaries |
| `lib/resolution.ts` | Searches for candidate official sites, filters non-company hosts, groups by domain, ranks, normalizes, and assigns a research UUID |
| `lib/resolution.test.ts` | Verifies domain parsing, host grouping, ranking, status classification, and normalization failure behavior |
| `lib/company-selection.ts` | Validates manual websites and converts explicit browser decisions into confirmed research inputs |
| `lib/company-selection.test.ts` | Verifies manual URL safety, selection mapping, discard behavior, and the all-decided gate |
| `lib/research-plans.ts` | Defines fixed Tavily queries, depth, recency, scores, result counts, and aggregator exclusions for each specialist |
| `lib/research-plans.test.ts` | Locks provider budget and query/responsibility boundaries against accidental expansion |
| `lib/tools.ts` | Validates environment configuration, calls Tavily/Firecrawl, enforces free-tier pacing, normalizes provider data, merges corpora, and sanitizes public errors |
| `lib/tools.test.ts` | Verifies payload shapes, failure classification, evidence normalization, deduplication, pacing, concurrency, and public error handling |
| `lib/evidence-quality.ts` | Canonicalizes URLs, fingerprints excerpts, rejects generic pages, detects duplicate roles/technologies, and retains only model-selected evidence |
| `lib/evidence-quality.test.ts` | Verifies generic-source filters, atomic technology rules, duplicate detection, and lineage selection |
| `lib/grounding.ts` | Restores safe partial reports, removes uncited lineage, and performs strict final claim/evidence/source validation |
| `lib/grounding.test.ts` | Covers citation integrity, duplicate sources/excerpts/jobs/technologies, generic evidence, optional omission, and restorative behavior |
| `lib/graph.ts` | Defines the five parallel specialists, synthesis, validation, graph topology, progress messages, tracing metadata, and per-company runner |
| `lib/graph.test.ts` | Protects LangGraph task-result handling so empty error results are not reported as completed stages |
| `lib/research-stream.ts` | Reads chunked NDJSON safely, validates every event, forwards progress, and returns the final batch result |
| `lib/research-stream.test.ts` | Verifies split network chunks, errors, malformed streams, and completion requirements |

## `prompts/` — model instructions only

| Path | What it does |
| --- | --- |
| `prompts/shared.ts` | Common untrusted-data rules, evidence boundaries, Torq relevance frame, and evidence-bundle serialization |
| `prompts/company-identity-normalization.ts` | Few-shot candidate ranking and grounded display-name/description cleanup |
| `prompts/first-party-context.ts` | Plain-language first-party company and product extraction |
| `prompts/recent-signals.ts` | Specific, recent, non-duplicate event classification |
| `prompts/hiring-signals.ts` | Current item-specific security/technical role classification with one strongest source |
| `prompts/security-signals.ts` | Explicit security-fact classification plus bounded why-it-matters analysis |
| `prompts/technology-signals.ts` | One named technology per signal with bounded Torq workflow relevance |
| `prompts/report-synthesis.ts` | Final report authorship from specialist-selected evidence and accumulated gaps |
| `prompts/prompts.test.ts` | Locks prompt-injection, grounding, specificity, deduplication, and inference rules |

## `docs/` — onboarding and submission artifacts

| Path | What it does |
| --- | --- |
| `docs/README.md` | Documentation index and reading order |
| `docs/HOW-IT-WORKS.md` | End-user journey, graph workflow, failure behavior, and state model |
| `docs/ARCHITECTURE.md` | System and graph diagrams, component boundaries, evidence flow, and observability |
| `docs/REPO-MAP.md` | This complete path-by-path repository guide |
| `docs/CURRENT-IMPLEMENTATION.md` | Current scope, contracts, provider budgets, report shape, verification status, and known limitations |
| `docs/ASSIGNMENT-COVERAGE.md` | Assignment requirement, optional Level 2, submission deliverable, and presentation-readiness audit |
| `docs/DEVELOPMENT.md` | Setup, change routing, safe change order, tests, and trace-first debugging |
| `docs/DEPLOYMENT.md` | Live Vercel project, production variables, custom domain, runtime verification, and firewall handoff |
| `docs/PROMPTS.md` | Friendly map of model responsibilities and code-enforced boundaries |
| `docs/SUBMISSION-NOTE.md` | Required half-page stack/rationale, next-week improvements, and AI-vs-human contribution note |
| `docs/SAMPLE-REPORT.md` | Required real generated HiBob report with research UUID and public sources |

## Generated and local-only paths

These are not application source and are not tracked for submission:

| Path | Why it exists |
| --- | --- |
| `.git/` | Local Git history and repository metadata |
| `node_modules/` | Installed npm packages; recreated by `npm install` |
| `.next/` | Next.js development/build output; recreated by `npm run dev` or `npm run build` |
| `coverage/` | Optional test coverage output |
| `.env.local` | Local secrets and endpoint choices; must never be committed |
| `tsconfig.tsbuildinfo` | TypeScript incremental compilation cache |
| `.agents/`, `.claude/`, `skills-lock.json` | Untracked local agent tooling supplied in this workspace; unrelated to runtime behavior and intentionally excluded from the application cleanup |

There are no required empty application folders. Generated folders may be absent until their corresponding command runs.
