import { describe, expect, it } from "vitest";
import {
  hasCompletedTaskOutput,
  RESEARCH_MODEL_LIMITS,
  RESEARCH_RUN_DEADLINE_MS,
} from "./graph";
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

  it("keeps every model attempt comfortably inside the run-level deadline", () => {
    expect(RESEARCH_MODEL_LIMITS.maxRetries).toBe(0);
    expect(RESEARCH_MODEL_LIMITS.specialistTimeoutMs).toBe(60_000);
    expect(RESEARCH_MODEL_LIMITS.synthesisTimeoutMs).toBe(60_000);
    expect(
      RESEARCH_MODEL_LIMITS.specialistTimeoutMs +
        RESEARCH_MODEL_LIMITS.synthesisTimeoutMs,
    ).toBeLessThan(RESEARCH_RUN_DEADLINE_MS);
  });
});
