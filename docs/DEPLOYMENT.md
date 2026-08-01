# Deployment and operations

## Live deployment

- Public URL: [https://torq-demo.galdaich.com](https://torq-demo.galdaich.com)
- Vercel project: `gal-daichs-projects/torq-customer-intelligence-agent`
- GitHub source: [GalDaich/torq-customer-intelligence-agent](https://github.com/GalDaich/torq-customer-intelligence-agent)
- Production branch: `main`
- Framework preset: Next.js
- Vercel Node.js version: 24.x
- Research Function limit: 300 seconds, declared in `app/api/research/route.ts`
- Domain: `torq-demo.galdaich.com`, verified under the Vercel-managed `galdaich.com` zone
- TLS: covered by Vercel's automatically renewed `*.galdaich.com` certificate

The hosted app uses the owner's production provider keys. The local setup in the root README uses each reviewer's own keys; no Vercel account is needed to run the product locally.

## Production environment contract

The Vercel Production environment contains these encrypted server-only variables:

```text
OPENAI_API_KEY
OPENAI_MODEL
TAVILY_API_KEY
FIRECRAWL_API_KEY
LANGSMITH_TRACING
LANGSMITH_API_KEY
LANGSMITH_PROJECT
LANGSMITH_ENDPOINT
```

No application secret uses a `NEXT_PUBLIC_` prefix. Preview deployments do not receive the production provider key set by default.

## Verified production behavior

On 2026-08-01 the deployed artifact passed:

- Vercel remote dependency installation, Next.js compilation, TypeScript checking, and route generation;
- HTTPS 200 response at the custom domain;
- visible, interactive UI with no framework error overlay;
- HiBob company discovery and explicit official-site confirmation;
- a complete streamed company graph within the Function duration;
- report launch into a company-named tab with research ID `9abac055-67e1-4df7-bd3c-9e64e4eac53f`;
- rendered citation badges and responsive accordion controls;
- Vercel runtime review with no error clusters and only HTTP 200 requests during the verification window.

This proves one hosted happy path. It does not replace the remaining five-company, weak-data, deliberate-failure, and exhaustive trace/source acceptance cases.

## Redeployment

Vercel's GitHub integration creates a production deployment whenever a commit reaches `main`. Pushes to other branches create preview deployments, so the normal release path is:

```bash
git push origin main
```

This checkout is also linked locally through the ignored `.vercel/` folder. An authenticated project owner can deploy the current checkout directly as a fallback:

```bash
vercel deploy --prod --scope gal-daichs-projects
```

Vercel automatically routes the latest production deployment to the assigned custom domain. `.vercelignore` prevents local agent tooling, secrets, dependencies, and generated output from entering uploads.

## Cost and abuse safeguards

- Each request accepts at most five companies and uses fixed provider plans.
- Firecrawl has an application-level concurrency and per-minute gate.
- Provider project budgets and free-tier quotas remain the hard spend boundary.
- Vercel's platform DDoS mitigation is active automatically.

A Vercel Firewall draft named `Observe production API bursts` is staged but intentionally **not published**. It matches production `POST /api*` traffic, counts by IP, and logs only after 20 requests within 10 minutes. This is the observation stage recommended before enforcing a lower 429 limit.

After reviewing the draft, the project owner can publish the non-blocking observation rule:

```bash
vercel firewall publish --yes --scope gal-daichs-projects
```

Observe legitimate traffic before changing the rule to an enforcing action or lowering its threshold.
