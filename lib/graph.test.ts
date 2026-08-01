import { describe, expect, it } from "vitest";
import { hasCompletedTaskOutput } from "./graph";

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
