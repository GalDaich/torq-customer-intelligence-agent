import type { ResearchStage } from "./schemas";

export type BackendLogEntry = {
  level: "info" | "warn" | "error";
  event: string;
  message: string;
  batchId?: string;
  researchId?: string;
  companyName?: string;
  stage?: ResearchStage | "resolution" | "batch" | "provider";
  status?: "started" | "completed" | "failed";
  durationMs?: number;
  totalCompanies?: number;
  candidateCount?: number;
  provider?: "Tavily" | "Firecrawl" | "OpenAI" | "LangSmith";
  operation?: string;
};

export function formatBackendLog(entry: BackendLogEntry): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    service: "torq-customer-intelligence-agent",
    ...entry,
  });
}

export function logBackend(entry: BackendLogEntry): void {
  const line = formatBackendLog(entry);
  if (entry.level === "error") console.error(line);
  else if (entry.level === "warn") console.warn(line);
  else console.info(line);
}
