"use client";

import { useMemo, useState } from "react";
import {
  ResolveResponseSchema,
  ResearchResponseSchema,
  type CompanyReport as CompanyReportData,
  type CompanyResolution,
  type ResearchResponse,
} from "@/lib/schemas";
import { CompanyReport } from "./company-report";
import { CompanyResolutionList } from "./company-resolution";
import { CompanyTagInput } from "./company-tag-input";

type Phase = "input" | "resolving" | "resolution" | "researching" | "results";

async function postJson(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "The request failed at a protected server boundary.";
    throw new Error(message);
  }
  return payload;
}

export function ResearchWorkspace() {
  const [companies, setCompanies] = useState<string[]>([]);
  const [phase, setPhase] = useState<Phase>("input");
  const [resolutions, setResolutions] = useState<CompanyResolution[]>([]);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [reports, setReports] = useState<CompanyReportData[]>([]);
  const [failures, setFailures] = useState<ResearchResponse["failures"]>([]);
  const [error, setError] = useState("");

  const selectedCompanies = useMemo(
    () =>
      resolutions.flatMap((resolution) => {
        const candidate = resolution.candidates.find(
          (item) => item.id === selections[resolution.researchId],
        );
        if (!candidate?.domain || !candidate.websiteUrl) return [];
        return [
          {
            researchId: resolution.researchId,
            company: {
              inputName: resolution.inputName,
              name: candidate.name,
              domain: candidate.domain,
              websiteUrl: candidate.websiteUrl,
              description: candidate.description,
            },
          },
        ];
      }),
    [resolutions, selections],
  );
  const unresolvedAmbiguity = resolutions.some(
    (resolution) =>
      resolution.status === "ambiguous" && !selections[resolution.researchId],
  );

  function updateCompanies(next: string[]) {
    setCompanies(next);
    setError("");
  }

  async function resolveCompanies() {
    if (companies.length === 0) {
      setError("Add at least one company.");
      return;
    }
    setError("");
    setReports([]);
    setFailures([]);
    setPhase("resolving");
    try {
      const payload = ResolveResponseSchema.parse(
        await postJson("/api/resolve", { companies }),
      );
      const automaticSelections = Object.fromEntries(
        payload.resolutions.flatMap((resolution) =>
          resolution.status === "unique" && resolution.candidates[0]
            ? [[resolution.researchId, resolution.candidates[0].id]]
            : [],
        ),
      );
      setResolutions(payload.resolutions);
      setSelections(automaticSelections);
      setPhase("resolution");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Company resolution failed.");
      setPhase("input");
    }
  }

  async function researchCompanies() {
    if (selectedCompanies.length === 0 || unresolvedAmbiguity) return;
    setError("");
    setPhase("researching");
    try {
      const payload = ResearchResponseSchema.parse(
        await postJson("/api/research", { companies: selectedCompanies }),
      );
      setReports(payload.reports);
      setFailures(payload.failures);
      setPhase("results");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Research failed.");
      setPhase("resolution");
    }
  }

  function editCompanies() {
    setPhase("input");
    setResolutions([]);
    setSelections({});
    setReports([]);
    setFailures([]);
    setError("");
  }

  const busy = phase === "resolving" || phase === "researching";

  return (
    <main className="workspace-shell">
      <header className="masthead">
        <div className="brand-mark" aria-label="Torq">
          TQ
        </div>
        <span>Customer intelligence</span>
        <span className="level-chip">Level 1 · Live public research</span>
      </header>

      <section className="hero">
        <p className="eyebrow">Evidence before assertion</p>
        <h1>Walk into the next security conversation prepared.</h1>
        <p className="hero-copy">
          Resolve the right companies, research current public signals, and turn traceable evidence
          into useful Torq talking points.
        </p>
      </section>

      <section className="input-card" aria-label="Company research form">
        <CompanyTagInput companies={companies} onChange={updateCompanies} disabled={phase !== "input"} />
        <div className="action-row">
          {phase === "input" || phase === "resolving" ? (
            <button className="primary-button" type="button" disabled={busy} onClick={resolveCompanies}>
              {phase === "resolving" ? "Resolving companies…" : "Resolve companies"}
            </button>
          ) : (
            <button className="secondary-button" type="button" disabled={busy} onClick={editCompanies}>
              Edit companies
            </button>
          )}
          <p>Public sources only · Provider keys stay server-side</p>
        </div>
        {error && <p className="error-banner" role="alert">{error}</p>}
      </section>

      {phase === "resolution" && (
        <>
          <CompanyResolutionList
            resolutions={resolutions}
            selections={selections}
            onSelect={(researchId, candidateId) =>
              setSelections((current) => ({ ...current, [researchId]: candidateId }))
            }
          />
          <div className="floating-action">
            <div>
              <strong>{selectedCompanies.length} selected</strong>
              <span>
                {unresolvedAmbiguity
                  ? "Choose every ambiguous company to continue."
                  : "Each company will run as an independent trace."}
              </span>
            </div>
            <button
              className="primary-button"
              type="button"
              disabled={selectedCompanies.length === 0 || unresolvedAmbiguity}
              onClick={researchCompanies}
            >
              Research selected companies
            </button>
          </div>
        </>
      )}

      {phase === "researching" && (
        <section className="honest-progress" aria-live="polite">
          <span className="spinner" aria-hidden="true" />
          <div>
            <h2>Research is in progress</h2>
            <p>
              {selectedCompanies.length} independent company {selectedCompanies.length === 1 ? "run" : "runs"}
              {" "}are gathering and validating public evidence. Results appear when the request completes.
            </p>
          </div>
        </section>
      )}

      {phase === "results" && (
        <section className="results-area">
          <div className="results-heading">
            <div>
              <p className="eyebrow">Validated output</p>
              <h2>{reports.length} {reports.length === 1 ? "report" : "reports"} ready</h2>
            </div>
            <button className="secondary-button" type="button" onClick={editCompanies}>
              Start another research set
            </button>
          </div>

          {failures.length > 0 && (
            <div className="failure-panel" role="status">
              <strong>{reports.length > 0 ? "Some companies could not be completed." : "No report was completed."}</strong>
              <ul>
                {failures.map((failure) => (
                  <li key={failure.researchId}>
                    <span>{failure.companyName}</span>
                    <span>{failure.message}</span>
                    <code>{failure.researchId}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {reports.map((report) => (
            <CompanyReport report={report} key={report.researchId} />
          ))}
        </section>
      )}
    </main>
  );
}
