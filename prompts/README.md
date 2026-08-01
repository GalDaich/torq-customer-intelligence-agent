# Prompt modules

Every OpenAI operation has one editable prompt module in this directory:

- `company-identity-normalization.ts` — pre-graph identity cleanup.
- `first-party-context.ts` — company and product extraction node.
- `recent-signals.ts` — news, funding, product, and leadership node.
- `hiring-signals.ts` — specific security-role node.
- `security-signals.ts` — security and operational signal node.
- `report-synthesis.ts` — final report-authoring node.
- `shared.ts` — common grounding and evidence-quality rules plus the typed evidence payload builder.

Runtime schemas remain in `lib/schemas.ts`; deterministic validation remains in `lib/grounding.ts`. Prompt modules may guide model judgment but cannot weaken those boundaries.
