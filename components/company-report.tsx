import type { CompanyReport as CompanyReportData, GroundedClaim } from "@/lib/schemas";

function Claim({ claim, report }: { claim: GroundedClaim; report: CompanyReportData }) {
  const sourcesById = new Map(report.sources.map((source) => [source.id, source]));
  const evidenceById = new Map(report.evidence.map((evidence) => [evidence.id, evidence]));
  const sourceNumbers = new Map(report.sources.map((source, index) => [source.id, index + 1]));
  const citedSourceIds = [
    ...new Set(
      claim.evidenceIds
        .map((id) => evidenceById.get(id)?.sourceId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  return (
    <p className="claim">
      <span>{claim.text}</span>{" "}
      <span className="citation-cluster">
        {citedSourceIds.map((sourceId) => {
          const source = sourcesById.get(sourceId);
          if (!source) return null;
          return (
            <a
              className="source-badge"
              href={source.url}
              target="_blank"
              rel="noreferrer"
              title={source.title}
              key={sourceId}
            >
              S{sourceNumbers.get(sourceId)}
            </a>
          );
        })}
      </span>
    </p>
  );
}

function EmptyEvidence({ children }: { children: string }) {
  return <p className="empty-evidence">{children}</p>;
}

export function CompanyReport({ report }: { report: CompanyReportData }) {
  return (
    <article className="report-card">
      <header className="report-header">
        <div>
          <p className="eyebrow">Customer intelligence report</p>
          <h2>{report.company.name}</h2>
          <a href={report.company.websiteUrl} target="_blank" rel="noreferrer">
            {report.company.domain} ↗
          </a>
        </div>
        <div className="research-id">
          <span>Research ID</span>
          <code>{report.researchId}</code>
        </div>
      </header>

      <section className="report-section report-lead">
        <h3>What they do</h3>
        <Claim claim={report.whatTheyDo} report={report} />
      </section>

      <div className="report-grid">
        <section className="report-section">
          <h3>Recent signals</h3>
          {report.recentSignals.length === 0 ? (
            <EmptyEvidence>No supported recent signals were found.</EmptyEvidence>
          ) : (
            <ul className="signal-list">
              {report.recentSignals.map((signal, index) => (
                <li key={`${signal.category}-${index}`}>
                  <span className="category-label">{signal.category}</span>
                  <Claim claim={signal.claim} report={report} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="report-section">
          <h3>Hiring signals</h3>
          {report.hiringSignals.length === 0 ? (
            <EmptyEvidence>No supported security hiring signals were found.</EmptyEvidence>
          ) : (
            <ul className="signal-list">
              {report.hiringSignals.map((signal, index) => (
                <li key={`${signal.roleTitle}-${index}`}>
                  <strong>{signal.roleTitle}</strong>
                  <p className="signal-meta">
                    {[signal.team, signal.location, signal.postedAt].filter(Boolean).join(" · ")}
                  </p>
                  <Claim claim={signal.claim} report={report} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="report-section">
          <h3>Security signals</h3>
          {report.securitySignals.length === 0 ? (
            <EmptyEvidence>No explicit security signals were supported.</EmptyEvidence>
          ) : (
            <ul className="signal-list">
              {report.securitySignals.map((signal, index) => (
                <li key={`${signal.category}-${index}`}>
                  <span className="category-label">{signal.category.replaceAll("_", " ")}</span>
                  <Claim claim={signal.claim} report={report} />
                  <div className="why-it-matters">
                    <span>Why it matters</span>
                    <Claim claim={signal.whyItMatters} report={report} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="report-section">
          <h3>Likely pain points</h3>
          {report.likelyPainPoints.length === 0 ? (
            <EmptyEvidence>Evidence was too weak to infer a pain point.</EmptyEvidence>
          ) : (
            <ul className="numbered-list">
              {report.likelyPainPoints.map((item, index) => (
                <li key={`${item.painPoint}-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{item.painPoint}</strong>
                    <Claim claim={item.rationale} report={report} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="report-section talking-points">
        <h3>Suggested talking points</h3>
        {report.talkingPoints.length === 0 ? (
          <EmptyEvidence>Evidence was too weak for a responsible talking point.</EmptyEvidence>
        ) : (
          <div className="talking-grid">
            {report.talkingPoints.map((item, index) => (
              <div key={`${item.point}-${index}`}>
                <span className="prompt-mark">↗</span>
                <strong>{item.point}</strong>
                <Claim claim={item.rationale} report={report} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="report-section confidence-panel">
        <h3>Confidence &amp; gaps</h3>
        <ul>
          {report.confidenceAndGaps.map((gap, index) => (
            <li key={`${gap}-${index}`}>{gap}</li>
          ))}
        </ul>
      </section>

      <details className="sources-panel">
        <summary>Sources ({report.sources.length})</summary>
        <ol>
          {report.sources.map((source, index) => (
            <li key={source.id}>
              <span>S{index + 1}</span>
              <a href={source.url} target="_blank" rel="noreferrer">
                {source.title}
              </a>
              <small>{source.publisher}</small>
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}
