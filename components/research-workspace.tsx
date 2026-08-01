"use client";

import { useMemo, useState } from "react";
import {
  ResolveResponseSchema,
  type CompanyReport as CompanyReportData,
  type CompanyResolution,
  type ResearchProgressEvent,
  type ResearchResponse,
  type ResolvedCompany,
} from "@/lib/schemas";
import { readResearchStream } from "@/lib/research-stream";
import { CompanyResolutionList } from "./company-resolution";
import { CompanyTagInput } from "./company-tag-input";
import { ReportLaunchCard } from "./report-launchpad";
import { ResearchProgress } from "./research-progress";

type Phase = "input" | "resolving" | "resolution" | "researching" | "results";

type SelectedCompany = {
  researchId: string;
  company: ResolvedCompany;
};

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
  const [progressEvents, setProgressEvents] = useState<ResearchProgressEvent[]>([]);
  const [activeCompanies, setActiveCompanies] = useState<SelectedCompany[]>([]);
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
      const automaticCompanies: SelectedCompany[] = payload.resolutions.flatMap((resolution) => {
        const candidate = resolution.candidates.find(
          (item) => item.id === automaticSelections[resolution.researchId],
        );
        if (!candidate?.domain || !candidate.websiteUrl) return [];
        return [{
          researchId: resolution.researchId,
          company: {
            inputName: resolution.inputName,
            name: candidate.name,
            domain: candidate.domain,
            websiteUrl: candidate.websiteUrl,
            description: candidate.description,
          },
        }];
      });
      setResolutions(payload.resolutions);
      setSelections(automaticSelections);
      const allUnique = payload.resolutions.every((resolution) => resolution.status === "unique");
      if (allUnique && automaticCompanies.length === payload.resolutions.length) {
        await startResearch(automaticCompanies);
      } else {
        setPhase("resolution");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Company resolution failed.");
      setPhase("input");
    }
  }

  async function startResearch(inputs: SelectedCompany[]) {
    setError("");
    setProgressEvents([]);
    setActiveCompanies(inputs);
    setPhase("researching");
    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companies: inputs }),
      });
      const payload = await readResearchStream(response, (event) => {
        setProgressEvents((current) => [...current, event]);
      });
      setReports(payload.reports);
      setFailures(payload.failures);
      setPhase("results");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Research failed.");
      setPhase("resolution");
    }
  }

  async function researchCompanies() {
    if (selectedCompanies.length === 0 || unresolvedAmbiguity) return;
    await startResearch(selectedCompanies);
  }

  function editCompanies() {
    setPhase("input");
    setResolutions([]);
    setSelections({});
    setReports([]);
    setFailures([]);
    setProgressEvents([]);
    setActiveCompanies([]);
    setError("");
  }

  const busy = phase === "resolving" || phase === "researching";

  return (
    <main className="workspace-shell">
      <header className="masthead">
        <div className="brand-mark" aria-label="Torq">
          TQ
        </div>
        <span>Customer Intelligence Agent</span>
      </header>

      <section className="hero">
        <p className="eyebrow">AI-powered account research</p>
        <h1>Turn public company signals into your next customer conversation.</h1>
        <p className="hero-copy">
          Research up to five companies at once and get concise reports on what they do, recent
          activity, security and hiring signals, likely pain points, and tailored talking points.
        </p>
      </section>

      <section className="input-card" aria-label="Company research form">
        <CompanyTagInput companies={companies} onChange={updateCompanies} disabled={phase !== "input"} />
        <div className="action-row">
          {phase === "input" || phase === "resolving" ? (
            <button className="primary-button" type="button" disabled={busy} onClick={resolveCompanies}>
              {phase === "resolving" ? "Finding companies…" : "Research companies"}
            </button>
          ) : (
            <button className="secondary-button" type="button" disabled={busy} onClick={editCompanies}>
              Edit companies
            </button>
          )}
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
                  : "The agent will build a separate intelligence report for each company."}
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
        <ResearchProgress
          companies={activeCompanies}
          events={progressEvents}
        />
      )}

      {phase === "results" && (
        <section className="results-area">
          <div className="results-heading">
            <div>
              <p className="eyebrow">Company report launchpad</p>
              <h2>{reports.length} {reports.length === 1 ? "report" : "reports"} ready</h2>
              {reports.length > 0 && (
                <p className="results-description">
                  Open a company to view its full intelligence report in a separate tab.
                </p>
              )}
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

          <div className="report-launch-grid">
            {reports.map((report) => (
              <ReportLaunchCard report={report} key={report.researchId} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
