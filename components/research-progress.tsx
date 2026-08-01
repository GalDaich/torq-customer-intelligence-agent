import type { ResearchProgressEvent, ResearchStage } from "@/lib/schemas";

// The stage order mirrors the graph contract. Percentages are derived from completed or
// failed server events, never from a client-side estimate.
const STAGES: Array<{ id: ResearchStage; label: string }> = [
  { id: "firstPartyContext", label: "First-party" },
  { id: "recentSignals", label: "Recent signals" },
  { id: "hiringSignals", label: "Hiring" },
  { id: "securitySignals", label: "Security" },
  { id: "technologySignals", label: "Tech stack" },
  { id: "synthesizeReport", label: "Synthesis" },
  { id: "validateReport", label: "Validation" },
];

type ResearchInput = {
  researchId: string;
  company: { name: string };
};

export function ResearchProgress({
  companies,
  events,
}: {
  companies: ResearchInput[];
  events: ResearchProgressEvent[];
}) {
  const latest = events[events.length - 1];
  const percentage = latest
    ? Math.min(100, Math.round((latest.completedSteps / latest.totalSteps) * 100))
    : 0;
  const active = [...events]
    .reverse()
    .find(
      (event) =>
        event.status === "started" &&
        !events.some(
          (candidate) =>
            candidate.researchId === event.researchId &&
            candidate.stage === event.stage &&
            candidate.sequence > event.sequence &&
            candidate.status !== "started",
        ),
    );
  const heading = active?.message ?? "Preparing company research…";

  return (
    <section className="progress-panel" aria-live="polite" aria-labelledby="progress-title">
      <div className="progress-heading">
        <div>
          <p className="eyebrow">Research progress</p>
          <h2 id="progress-title">{heading}</h2>
        </div>
        <strong>{percentage}%</strong>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Research progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
      >
        <span style={{ width: `${percentage}%` }} />
      </div>

      <div className="company-progress-list">
        {companies.map(({ researchId, company }) => (
          <div className="company-progress-row" key={researchId}>
            <div>
              <strong>{company.name}</strong>
              <code>{researchId}</code>
            </div>
            <ol>
              {STAGES.map((stage) => {
                const stageEvents = events.filter(
                  (event) => event.researchId === researchId && event.stage === stage.id,
                );
                const status = stageEvents[stageEvents.length - 1]?.status ?? "pending";
                return (
                  <li className={`stage-${status}`} key={stage.id}>
                    <span aria-hidden="true" />
                    {stage.label}
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
