"use client";

import { useState, type ReactNode } from "react";
import type { CompanyReport as CompanyReportData, GroundedClaim } from "@/lib/schemas";

// Every visible claim resolves its evidence IDs back to source URLs and renders compact
// citation badges. Missing lineage cannot be invented by this presentation layer.
export function GroundedClaimText({
  claim,
  report,
}: {
  claim: GroundedClaim;
  report: CompanyReportData;
}) {
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

type ReportSectionId =
  | "company"
  | "recent"
  | "hiring"
  | "security"
  | "technology"
  | "pain-points"
  | "talking-points"
  | "confidence"
  | "sources";

function ReportAccordionSection({
  reportId,
  sectionId,
  title,
  open,
  onToggle,
  children,
}: {
  reportId: string;
  sectionId: ReportSectionId;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const triggerId = `${reportId}-${sectionId}-trigger`;
  const panelId = `${reportId}-${sectionId}-panel`;

  return (
    <section className="report-accordion-item">
      <h3 className="report-accordion-heading">
        <button
          id={triggerId}
          className="report-accordion-trigger"
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <span>{title}</span>
          <span className="accordion-mark" aria-hidden="true">{open ? "−" : "+"}</span>
        </button>
      </h3>
      {open ? (
        <div
          id={panelId}
          className="report-accordion-panel"
          role="region"
          aria-labelledby={triggerId}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function CompanyReport({ report }: { report: CompanyReportData }) {
  // A single section can be open at a time, keeping long reports easy to scan during a call.
  const [openSection, setOpenSection] = useState<ReportSectionId | null>(null);

  function sectionProps(sectionId: ReportSectionId, title: string) {
    return {
      reportId: report.researchId,
      sectionId,
      title,
      open: openSection === sectionId,
      onToggle: () => setOpenSection((current) => (current === sectionId ? null : sectionId)),
    };
  }

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

      <div className="report-accordion-stack">
        <ReportAccordionSection {...sectionProps("company", "What they do")}>
          <div className="report-section report-lead">
            {report.whatTheyDo ? (
              <GroundedClaimText claim={report.whatTheyDo} report={report} />
            ) : (
              <EmptyEvidence>No supported first-party company description was available.</EmptyEvidence>
            )}
          </div>
        </ReportAccordionSection>

        <ReportAccordionSection {...sectionProps("recent", "Recent signals")}>
          <div className="report-section">
            {report.recentSignals.length === 0 ? (
              <EmptyEvidence>No supported recent signals were found.</EmptyEvidence>
            ) : (
              <ul className="signal-list">
                {report.recentSignals.map((signal, index) => (
                  <li key={`${signal.category}-${index}`}>
                    <span className="category-label">{signal.category}</span>
                    <GroundedClaimText claim={signal.claim} report={report} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ReportAccordionSection>

        <ReportAccordionSection {...sectionProps("hiring", "Hiring signals")}>
          <div className="report-section">
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
                    <GroundedClaimText claim={signal.claim} report={report} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ReportAccordionSection>

        <ReportAccordionSection {...sectionProps("security", "Security signals")}>
          <div className="report-section">
            {report.securitySignals.length === 0 ? (
              <EmptyEvidence>No explicit security signals were supported.</EmptyEvidence>
            ) : (
              <ul className="signal-list">
                {report.securitySignals.map((signal, index) => (
                  <li key={`${signal.category}-${index}`}>
                    <span className="category-label">{signal.category.replaceAll("_", " ")}</span>
                    <GroundedClaimText claim={signal.claim} report={report} />
                    <div className="why-it-matters">
                      <span>Why it matters</span>
                      <GroundedClaimText claim={signal.whyItMatters} report={report} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ReportAccordionSection>

        <ReportAccordionSection {...sectionProps("technology", "Technology & integration signals")}>
          <div className="report-section">
            {report.technologySignals.length === 0 ? (
              <EmptyEvidence>No specific technology-stack signals were supported.</EmptyEvidence>
            ) : (
              <ul className="signal-list">
                {report.technologySignals.map((signal) => (
                  <li key={`${signal.category}-${signal.technology}`}>
                    <span className="category-label">{signal.category.replaceAll("_", " ")}</span>
                    <strong>{signal.technology}</strong>
                    <GroundedClaimText claim={signal.claim} report={report} />
                    <div className="why-it-matters">
                      <span>Torq relevance</span>
                      <GroundedClaimText claim={signal.torqRelevance} report={report} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ReportAccordionSection>

        <ReportAccordionSection {...sectionProps("pain-points", "Likely pain points")}>
          <div className="report-section">
            {report.likelyPainPoints.length === 0 ? (
              <EmptyEvidence>Evidence was too weak to infer a pain point.</EmptyEvidence>
            ) : (
              <ul className="numbered-list">
                {report.likelyPainPoints.map((item, index) => (
                  <li key={`${item.painPoint}-${index}`}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>{item.painPoint}</strong>
                      <GroundedClaimText claim={item.rationale} report={report} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ReportAccordionSection>

        <ReportAccordionSection {...sectionProps("talking-points", "Suggested talking points")}>
          <div className="report-section">
            {report.talkingPoints.length === 0 ? (
              <EmptyEvidence>Evidence was too weak for a responsible talking point.</EmptyEvidence>
            ) : (
              <div className="talking-grid">
                {report.talkingPoints.map((item, index) => (
                  <div key={`${item.point}-${index}`}>
                    <span className="prompt-mark">↗</span>
                    <strong>{item.point}</strong>
                    <GroundedClaimText claim={item.rationale} report={report} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </ReportAccordionSection>

        <ReportAccordionSection {...sectionProps("confidence", "Confidence & gaps")}>
          <div className="report-section confidence-panel">
            <ul>
              {report.confidenceAndGaps.map((gap, index) => (
                <li key={`${gap}-${index}`}>{gap}</li>
              ))}
            </ul>
          </div>
        </ReportAccordionSection>

        <ReportAccordionSection {...sectionProps("sources", `Sources (${report.sources.length})`)}>
          <div className="report-section">
            <ol className="sources-list">
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
          </div>
        </ReportAccordionSection>
      </div>
    </article>
  );
}
