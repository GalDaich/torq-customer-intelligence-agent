import { describe, expect, it } from "vitest";
import { hasCompletedTaskOutput } from "./graph";
import { RESEARCH_STAGES } from "./schemas";

describe("LangGraph task completion", () => {
  it("rejects the empty result envelope emitted before a task error", () => {
    expect(hasCompletedTaskOutput({})).toBe(false);
    expect(hasCompletedTaskOutput(undefined)).toBe(false);
  });

  it("accepts a task result that contains graph state updates", () => {
    expect(hasCompletedTaskOutput({ recentResult: { signals: [] } })).toBe(true);
    expect(hasCompletedTaskOutput({ report: { researchId: "example" } })).toBe(true);
  });
});

describe("research graph stages", () => {
  it("includes technology research in the streamed progress contract", () => {
    expect(RESEARCH_STAGES).toContain("technologySignals");
    expect(RESEARCH_STAGES).toHaveLength(7);
  });
});
