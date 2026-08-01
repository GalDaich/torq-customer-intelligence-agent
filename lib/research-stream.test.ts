import { describe, expect, it, vi } from "vitest";
import { readResearchStream } from "./research-stream";

const batchId = "c03858bb-56ef-4c99-9f05-e5687ac3e5ec";
const researchId = "9992c3a6-27a5-4c48-87ce-6b2258bf04f9";

describe("browser research stream reader", () => {
  it("handles progress lines split across network chunks", async () => {
    const encoder = new TextEncoder();
    const progress = JSON.stringify({
      type: "progress",
      timestamp: "2026-08-01T09:00:00.000Z",
      sequence: 1,
      batchId,
      researchId,
      companyName: "Acme",
      stage: "recentSignals",
      status: "started",
      message: "Searching recent signals.",
      completedSteps: 0,
      totalSteps: 6,
      durationMs: null,
    });
    const complete = JSON.stringify({
      type: "complete",
      timestamp: "2026-08-01T09:00:01.000Z",
      sequence: 2,
      batchId,
      response: { reports: [], failures: [] },
    });
    const body = `${progress}\n${complete}\n`;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(body.slice(0, 50)));
        controller.enqueue(encoder.encode(body.slice(50)));
        controller.close();
      },
    });
    const onProgress = vi.fn();

    const response = await readResearchStream(new Response(stream), onProgress);

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "recentSignals", status: "started" }),
    );
    expect(response).toEqual({ reports: [], failures: [] });
  });
});
