# How the product works

## The user journey

1. **Enter companies.** The user types or pastes one to five names or domains. Commas and new lines create removable tags; duplicates are ignored.
2. **Find official websites.** The browser sends the cleaned names to `/api/resolve`.
3. **Review identity candidates.** For each name, the server searches the public web, groups results by domain, ranks likely primary sites, and asks an LLM to clean and order only those discovered candidates.
4. **Make an explicit decision.** The user selects a candidate, enters an official website manually, or discards that company. Research stays blocked until every row has a decision and at least one company remains selected.
5. **Run research.** The browser sends only confirmed companies to `/api/research`. Each company runs independently and concurrently.
6. **Watch real progress.** The server streams newline-delimited JSON events when graph stages start, complete, or fail. The percentage is based on those events, not an estimated timer.
7. **Open reports.** The launchpad shows every successful company even if a peer failed. Each card opens a company-named tab containing a closed-by-default, single-open report accordion.
8. **Follow the evidence.** Claim badges open the public source supporting that statement. The Confidence & gaps section says what is missing, stale, uncertain, or worth verifying.

## What happens inside one graph

The graph has five parallel research specialists:

| Specialist | Retrieval | What it may return |
| --- | --- | --- |
| First-party | Confirmed website homepage plus up to two focused same-domain pages | Plain-language company description and supported product context |
| Recent | Bounded one-year web/news searches | Specific funding, product, partnership, acquisition, expansion, or leadership events |
| Hiring | Focused searches excluding common aggregators where possible | Specific current security, DevSecOps, platform, infrastructure, or IT-automation roles |
| Security | Web and recent-news searches | Explicit security team, product, compliance, incident, infrastructure, or automation signals |
| Technology | Public stack, engineering, architecture, and job evidence | One named security/cloud/workflow-adjacent technology per finding |

Each specialist classifies only its own evidence and returns gaps when evidence is missing. The graph then:

1. merges the retained corpora;
2. removes duplicate URLs and excerpts;
3. asks the synthesis model for the report structure;
4. validates every claim and citation deterministically;
5. removes unsafe optional findings and records why;
6. returns the remaining grounded report.

## Failure behavior

The application distinguishes a rejected request from incomplete public evidence.

- Missing environment configuration and provider HTTP 4xx responses block the affected operation. These usually mean authentication, authorization, quota, rate-limit, or request problems that should not be disguised as “no evidence.”
- Provider network/5xx failures, unreadable successful payloads, missing evidence, extraction failures, synthesis failures, and optional grounding failures produce honest gaps or a safe partial report where possible.
- One company's blocking failure becomes a visible batch failure and does not remove other companies' successful reports.
- No deterministic fallback invents a report, pain point, talking point, or provider result.

## Where state lives

Current input, resolution decisions, progress, and results live only in the browser page session. The server holds no application database. Refreshing loses the session. This is consistent with the chosen Level 1 scope; persistence and change detection belong to optional Level 2 and are not implemented.

## A useful mental model

```text
find possibilities -> human confirms identity -> collect bounded evidence
-> models classify and synthesize -> code verifies lineage -> user follows citations
```

If you change the program, preserve that ordering. In particular, never let discovery authorize research and never let synthesis bypass deterministic grounding.
