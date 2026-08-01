# Prompt modules

Every OpenAI operation has one editable module under `prompts/`:

| Module | Responsibility |
| --- | --- |
| `company-identity-normalization.ts` | Rank and clean only discovered company candidates before the graph |
| `first-party-context.ts` | Extract plain-language company and product context from confirmed first-party pages |
| `recent-signals.ts` | Select specific recent funding, product, partnership, acquisition, expansion, or leadership events |
| `hiring-signals.ts` | Select current item-specific security and adjacent technical roles without duplicate listings |
| `security-signals.ts` | Separate explicit security facts from bounded Torq-relevant implications |
| `technology-signals.ts` | Select one named technology per finding and frame only a possible workflow surface |
| `report-synthesis.ts` | Compose the final report from specialist-selected evidence |
| `shared.ts` | Supply common grounding rules, Torq relevance constraints, and the typed evidence bundle |

Runtime schemas remain in `lib/schemas.ts`. Provider normalization remains in `lib/tools.ts`. Deterministic evidence selection and final validation remain in `lib/evidence-quality.ts` and `lib/grounding.ts`.

Prompts guide model judgment but cannot weaken those code-enforced boundaries. If a prompt contract changes, update its schema, grounding rules, tests, and the relevant onboarding documents together.
