# Developer onboarding

## First setup

1. Install Node.js 20.9 or newer and npm.
2. Run `npm install`.
3. Copy `.env.example` to `.env.local` and add the required server-only credentials.
4. Run `npm run dev` and open `http://localhost:3000`.
5. Before editing, run `npm run check` once so you know the starting state.

Do not commit `.env.local`, provider keys, LangSmith account details, or raw provider payloads.

## Where to make common changes

| Change | Start here | Also review |
| --- | --- | --- |
| Add or change a report field | `lib/schemas.ts` | `prompts/report-synthesis.ts`, `lib/grounding.ts`, `components/company-report.tsx`, tests |
| Change a research category | `lib/graph.ts` | `lib/research-plans.ts`, matching prompt, progress stages, schemas, tests |
| Tune search queries or spend | `lib/research-plans.ts` | `docs/CURRENT-IMPLEMENTATION.md`, plan tests |
| Change provider normalization | `lib/tools.ts` | evidence-quality and grounding tests |
| Change company discovery | `lib/resolution.ts` | normalization prompt, resolution UI, tests |
| Change the confirmation flow | `components/research-workspace.tsx` | `components/company-resolution.tsx`, selection helpers, tests |
| Change report presentation | `components/company-report.tsx` | `app/globals.css`, render tests |
| Change progress behavior | `app/api/research/route.ts` | `lib/research-stream.ts`, progress component, stream tests |

## Safe change order

1. Update the schema or boundary contract first.
2. Update the producer (provider adapter, graph node, or route).
3. Update the consumer (prompt, UI, or stream reader).
4. Add or update the smallest focused tests.
5. Run `npm run check`.
6. Run `npm run build` for any implementation, configuration, or dependency change.
7. Use a real provider run only when deterministic fixtures cannot verify the behavior.

## Non-negotiable design rules

- Discovery never authorizes research.
- A model can cite only evidence IDs supplied to it.
- Torq's product frame guides relevance; it is not evidence about the target company.
- Do not infer pain, manual work, tool fragmentation, integration availability, budget, urgency, or buying intent without target-company evidence.
- Expected incomplete evidence becomes a visible gap.
- Provider 4xx and missing required configuration remain blocking.
- Do not add a synthetic fallback report.
- Preserve the same research UUID across resolution, graph state, progress, report, and traces.
- Keep provider credentials and requests on the server.

## Tests

Test files sit beside the modules they protect. The suite emphasizes contracts rather than screenshots:

- tag parsing and resolution decisions;
- company identity normalization boundaries;
- fixed search plans and provider budgets;
- provider payload normalization and free-tier gating;
- evidence filtering, duplicate detection, and final grounding;
- NDJSON stream parsing and independent batch outcomes;
- critical report, progress, and resolution rendering states;
- prompt rules that guard grounding and prompt-injection boundaries.

## Debugging a real run

Use the visible report UUID as the correlation key. In the configured LangSmith project, search for `research:<uuid>` and inspect both the `normalize_company_identity` trace and the company graph. Compare the exact failing stage, its inputs, and provider/model span before changing code or spending credits on another run.
