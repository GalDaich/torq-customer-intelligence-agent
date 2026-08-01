"use client";

import { useState } from "react";
import type { ResolutionDecision } from "@/lib/company-selection";
import type { CompanyResolution } from "@/lib/schemas";

type Props = {
  resolutions: CompanyResolution[];
  decisions: Record<string, ResolutionDecision>;
  onSelect: (researchId: string, candidateId: string) => void;
  onDiscard: (researchId: string) => void;
  onRestore: (researchId: string) => void;
  onManualWebsite: (researchId: string, website: string) => string | null;
};

export function CompanyResolutionList({
  resolutions,
  decisions,
  onSelect,
  onDiscard,
  onRestore,
  onManualWebsite,
}: Props) {
  const [manualWebsites, setManualWebsites] = useState<Record<string, string>>({});
  const [manualErrors, setManualErrors] = useState<Record<string, string>>({});

  function submitManualWebsite(researchId: string) {
    const message = onManualWebsite(researchId, manualWebsites[researchId] ?? "");
    setManualErrors((current) => ({ ...current, [researchId]: message ?? "" }));
  }

  return (
    <section className="resolution-panel" aria-labelledby="resolution-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Confirm company websites</p>
          <h2 id="resolution-title">Choose the official website for each company.</h2>
        </div>
        <p>Research starts only after you confirm, manually enter, or discard every company.</p>
      </div>

      <div className="resolution-list">
        {resolutions.map((resolution) => {
          const decision = decisions[resolution.researchId];
          const selectedId = decision?.kind === "candidate" ? decision.candidateId : undefined;
          const discarded = decision?.kind === "discarded";
          const manualCompany = decision?.kind === "manual" ? decision.company : undefined;
          const resolved = Boolean(decision && !discarded);
          return (
            <article
              className={`resolution-row ${discarded ? "is-discarded" : ""}`}
              key={resolution.researchId}
            >
              <div className="resolution-label">
                <span
                  className={`status-dot ${resolved ? "status-unique" : discarded ? "status-not_found" : ""}`}
                  aria-hidden="true"
                />
                <div>
                  <h3>{resolution.inputName}</h3>
                  <p>
                    {discarded && "Discarded"}
                    {manualCompany && "Manual website selected"}
                    {selectedId && "Official website selected"}
                    {!decision && resolution.candidates.length > 0 && "Confirmation required"}
                    {!decision && resolution.candidates.length === 0 && "No match found"}
                  </p>
                </div>
              </div>

              <div className="resolution-options">
                {resolution.candidates.length > 0 ? (
                  <div className="candidate-grid">
                    {resolution.candidates.map((candidate) => {
                      const source = resolution.sources.find((item) =>
                        candidate.sourceIds.includes(item.id),
                      );
                      const selected = candidate.id === selectedId;
                      return (
                        <div
                          className={`candidate-card ${selected ? "is-selected" : ""}`}
                          key={candidate.id}
                        >
                          <button
                            className="candidate-select"
                            type="button"
                            aria-pressed={selected}
                            onClick={() => onSelect(resolution.researchId, candidate.id)}
                          >
                            <span className="candidate-check" aria-hidden="true">
                              {selected ? "✓" : ""}
                            </span>
                            <strong>{candidate.name}</strong>
                            <span className="candidate-domain">{candidate.domain}</span>
                            <span className="candidate-description">{candidate.description}</span>
                          </button>
                          {source && (
                            <a href={source.url} target="_blank" rel="noreferrer">
                              Open discovery source ↗
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="gap-message">{resolution.gaps[0]}</p>
                )}

                <div className="resolution-alternatives">
                  <div className={`manual-website ${manualCompany ? "is-selected" : ""}`}>
                    <label htmlFor={`manual-website-${resolution.researchId}`}>
                      Enter the official website manually
                    </label>
                    <div>
                      <input
                        id={`manual-website-${resolution.researchId}`}
                        type="url"
                        inputMode="url"
                        placeholder="https://company.com"
                        value={manualWebsites[resolution.researchId] ?? ""}
                        onChange={(event) => {
                          const value = event.target.value;
                          setManualWebsites((current) => ({
                            ...current,
                            [resolution.researchId]: value,
                          }));
                          setManualErrors((current) => ({
                            ...current,
                            [resolution.researchId]: "",
                          }));
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            submitManualWebsite(resolution.researchId);
                          }
                        }}
                      />
                      <button
                        className="secondary-button compact-button"
                        type="button"
                        onClick={() => submitManualWebsite(resolution.researchId)}
                      >
                        {manualCompany ? "Update website" : "Use website"}
                      </button>
                    </div>
                    {manualCompany && (
                      <p className="manual-selection">Using {manualCompany.websiteUrl}</p>
                    )}
                    {manualErrors[resolution.researchId] && (
                      <p className="field-error" role="alert">
                        {manualErrors[resolution.researchId]}
                      </p>
                    )}
                  </div>

                  <button
                    className="text-button danger-text-button"
                    type="button"
                    onClick={() => discarded
                      ? onRestore(resolution.researchId)
                      : onDiscard(resolution.researchId)}
                  >
                    {discarded ? "Restore company" : "None of these — discard company"}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
