import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResearchProgress } from "./research-progress";

describe("research progress", () => {
  it("renders actual stage state and overall completion", () => {
    const researchId = "296585ea-7dbe-4b6c-b0eb-e55542185e15";
    const html = renderToStaticMarkup(
      <ResearchProgress
        companies={[{ researchId, company: { name: "Acme" } }]}
        events={[
          {
            type: "progress",
            timestamp: "2026-08-01T09:00:00.000Z",
            sequence: 1,
            batchId: "05b32ea3-38ef-49bc-978a-12e478f38ef7",
            researchId,
            companyName: "Acme",
            stage: "recentSignals",
            status: "completed",
            message: "Recent-signal research completed.",
            completedSteps: 1,
            totalSteps: 6,
            durationMs: 120,
          },
        ]}
      />,
    );

    expect(html).toContain('aria-valuenow="17"');
    expect(html).toContain("Recent signals");
    expect(html).toContain("stage-completed");
    expect(html).not.toContain("Run log");
    expect(html).not.toContain("120ms");
  });
});
