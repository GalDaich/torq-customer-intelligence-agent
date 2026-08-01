"use client";

import type { CompanyResolution } from "@/lib/schemas";

type Props = {
  resolutions: CompanyResolution[];
  selections: Record<string, string>;
  onSelect: (researchId: string, candidateId: string) => void;
};

export function CompanyResolutionList({ resolutions, selections, onSelect }: Props) {
  return (
    <section className="resolution-panel" aria-labelledby="resolution-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Identity check</p>
          <h2 id="resolution-title">Confirm the right companies</h2>
        </div>
        <p>Ambiguous matches require your selection before research begins.</p>
      </div>

      <div className="resolution-list">
        {resolutions.map((resolution) => {
          const selectedId = selections[resolution.researchId];
          return (
            <article className="resolution-row" key={resolution.researchId}>
              <div className="resolution-label">
                <span className={`status-dot status-${resolution.status}`} aria-hidden="true" />
                <div>
                  <h3>{resolution.inputName}</h3>
                  <p>
                    {resolution.status === "unique" && "Ready for research"}
                    {resolution.status === "ambiguous" && "Choose one match"}
                    {resolution.status === "not_found" && "No confident match found"}
                  </p>
                </div>
              </div>

              {resolution.status === "not_found" ? (
                <p className="gap-message">{resolution.gaps[0]}</p>
              ) : (
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
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
