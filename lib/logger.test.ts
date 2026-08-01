import { describe, expect, it } from "vitest";
import { formatBackendLog } from "./logger";

describe("structured backend logs", () => {
  it("emits searchable correlation fields without arbitrary payloads", () => {
    const line = formatBackendLog({
      level: "info",
      event: "research_stage_started",
      message: "Recent-signal research started.",
      batchId: "630f4964-a511-486c-9791-14a33063041f",
      researchId: "8acd5b6f-ed04-44d9-b38f-c612b2097403",
      companyName: "Acme",
      stage: "recentSignals",
      status: "started",
    });
    const parsed = JSON.parse(line) as Record<string, unknown>;

    expect(parsed).toMatchObject({
      service: "torq-customer-intelligence-agent",
      event: "research_stage_started",
      researchId: "8acd5b6f-ed04-44d9-b38f-c612b2097403",
      stage: "recentSignals",
    });
    expect(parsed).not.toHaveProperty("apiKey");
    expect(parsed).not.toHaveProperty("evidence");
  });
});
