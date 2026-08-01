"use client";

import { useState } from "react";
import type { CompanyReport as CompanyReportData } from "@/lib/schemas";
import { CompanyReport } from "./company-report";

async function renderReportTab(report: CompanyReportData, reportWindow: Window) {
  const { createRoot } = await import("react-dom/client");
  if (reportWindow.closed) return;

  const mount = reportWindow.document.createElement("main");
  mount.className = "report-tab-shell";
  reportWindow.document.body.appendChild(mount);
  createRoot(mount).render(<CompanyReport report={report} />);
}

function openReportTab(report: CompanyReportData) {
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) return false;

  reportWindow.document.documentElement.lang = "en";
  reportWindow.document.title = report.company.name;
  reportWindow.document.head.replaceChildren();
  reportWindow.document.body.replaceChildren();

  const title = reportWindow.document.createElement("title");
  title.textContent = report.company.name;
  reportWindow.document.head.appendChild(title);

  const charset = reportWindow.document.createElement("meta");
  charset.setAttribute("charset", "utf-8");
  reportWindow.document.head.appendChild(charset);

  const viewport = reportWindow.document.createElement("meta");
  viewport.name = "viewport";
  viewport.content = "width=device-width, initial-scale=1";
  reportWindow.document.head.appendChild(viewport);

  const base = reportWindow.document.createElement("base");
  base.href = window.location.href;
  reportWindow.document.head.appendChild(base);

  document.head.querySelectorAll('link[rel="stylesheet"], style').forEach((stylesheet) => {
    reportWindow.document.head.appendChild(stylesheet.cloneNode(true));
  });

  reportWindow.opener = null;
  reportWindow.focus();
  void renderReportTab(report, reportWindow).catch(() => {
    if (reportWindow.closed) return;
    const message = reportWindow.document.createElement("p");
    message.className = "report-tab-error";
    message.textContent = "The report could not be opened. Close this tab and try again.";
    reportWindow.document.body.appendChild(message);
  });
  return true;
}

export function ReportLaunchCard({ report }: { report: CompanyReportData }) {
  const [error, setError] = useState("");

  return (
    <div className="report-launch-item">
      <button
        className="report-launch-card"
        type="button"
        aria-label={`Open ${report.company.name} report in a new tab`}
        onClick={() => {
          setError("");
          if (!openReportTab(report)) {
            setError("Your browser blocked the report tab. Allow pop-ups for this page and try again.");
          }
        }}
      >
        <strong>{report.company.name}</strong>
        <span>{report.company.websiteUrl}</span>
      </button>
      {error && <p className="report-launch-error" role="alert">{error}</p>}
    </div>
  );
}
