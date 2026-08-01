import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import {
  runCompanyResearch,
  type ResearchProgressUpdate,
} from "@/lib/graph";
import {
  ResearchCompleteEventSchema,
  RESEARCH_STAGES,
  ResearchProgressEventSchema,
  ResearchRequestSchema,
  ResearchResponseSchema,
  ResearchStreamErrorEventSchema,
  type CompanyReport,
  type ResolvedCompany,
} from "@/lib/schemas";
import { publicErrorMessage } from "@/lib/tools";

// Vercel Hobby Functions allow up to five minutes with Fluid Compute. The research route
// streams throughout that window, which is enough for the bounded Level 1 demo workflow.
export const maxDuration = 300;

type ResearchInput = {
  researchId: string;
  company: ResolvedCompany;
};

type ProgressRunner = (
  researchId: string,
  company: ResolvedCompany,
  onProgress?: (update: ResearchProgressUpdate) => void | Promise<void>,
  signal?: AbortSignal,
) => Promise<CompanyReport>;

type ResearchStreamContext = {
  requestId?: string | null;
};

function logResearchEvent(
  level: "info" | "warn" | "error",
  message: string,
  fields: Record<string, unknown>,
): void {
  console[level](
    JSON.stringify({ level, message, route: "/api/research", ...fields }),
  );
}

function errorLogFields(error: unknown): Record<string, string> {
  return error instanceof Error
    ? { errorName: error.name, errorMessage: error.message }
    : { errorName: "UnknownError", errorMessage: "A non-Error value was thrown." };
}

export function createResearchStream(
  companies: ResearchInput[],
  runner: ProgressRunner = runCompanyResearch,
  context: ResearchStreamContext = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const batchId = randomUUID();
  const startedAt = Date.now();
  const abortController = new AbortController();
  const totalSteps = companies.length * RESEARCH_STAGES.length;
  let completedSteps = 0;
  let sequence = 0;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: unknown) => {
        if (abortController.signal.aborted) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      logResearchEvent("info", "Research batch started.", {
        batchId,
        requestId: context.requestId ?? null,
        companyCount: companies.length,
      });

      void (async () => {
        try {
          // Company graphs run independently. A protected failure becomes one batch failure
          // record and does not erase reports already produced for the other companies.
          const outcomes = await Promise.all(
            companies.map(async ({ researchId, company }) => {
              try {
                const report = await runner(researchId, company, async (update) => {
                  if (update.status === "completed" || update.status === "failed") {
                    completedSteps += 1;
                    logResearchEvent(
                      update.status === "failed" ? "warn" : "info",
                      `Research stage ${update.status}.`,
                      {
                        batchId,
                        requestId: context.requestId ?? null,
                        researchId,
                        companyName: company.name,
                        stage: update.stage,
                        durationMs: update.durationMs,
                      },
                    );
                  }
                  const event = ResearchProgressEventSchema.parse({
                    type: "progress",
                    timestamp: new Date().toISOString(),
                    sequence: ++sequence,
                    batchId,
                    researchId,
                    companyName: company.name,
                    ...update,
                    completedSteps,
                    totalSteps,
                  });
                  emit(event);
                }, abortController.signal);
                return { report } as const;
              } catch (error) {
                const failure = {
                  researchId,
                  companyName: company.name,
                  message: publicErrorMessage(error),
                };
                logResearchEvent("warn", "Company research failed safely.", {
                  batchId,
                  requestId: context.requestId ?? null,
                  researchId,
                  companyName: company.name,
                  message: failure.message,
                  ...errorLogFields(error),
                });
                return { failure } as const;
              }
            }),
          );
          const response = ResearchResponseSchema.parse({
            reports: outcomes.flatMap((outcome) => ("report" in outcome ? [outcome.report] : [])),
            failures: outcomes.flatMap((outcome) =>
              "failure" in outcome ? [outcome.failure] : [],
            ),
          });
          emit(
            ResearchCompleteEventSchema.parse({
              type: "complete",
              timestamp: new Date().toISOString(),
              sequence: ++sequence,
              batchId,
              response,
            }),
          );
          logResearchEvent("info", "Research batch completed.", {
            batchId,
            requestId: context.requestId ?? null,
            durationMs: Date.now() - startedAt,
            reportCount: response.reports.length,
            failureCount: response.failures.length,
          });
        } catch (error) {
          const message = publicErrorMessage(error);
          emit(
            ResearchStreamErrorEventSchema.parse({
              type: "error",
              timestamp: new Date().toISOString(),
              sequence: ++sequence,
              batchId,
              message,
            }),
          );
          logResearchEvent("error", "Research batch failed.", {
            batchId,
            requestId: context.requestId ?? null,
            durationMs: Date.now() - startedAt,
            message,
            ...errorLogFields(error),
          });
        } finally {
          if (!abortController.signal.aborted) controller.close();
        }
      })();
    },
    cancel() {
      abortController.abort(new Error("The research client disconnected."));
      logResearchEvent("warn", "Research stream cancelled by the client.", {
        batchId,
        requestId: context.requestId ?? null,
        durationMs: Date.now() - startedAt,
      });
    },
  });
}

export async function POST(request: Request) {
  try {
    // The response stays open as NDJSON so the browser can render actual graph events
    // instead of guessing progress with a timer.
    const body = ResearchRequestSchema.parse(await request.json());
    return new Response(
      createResearchStream(body.companies, runCompanyResearch, {
        requestId: request.headers.get("x-vercel-id"),
      }),
      {
        headers: {
          "Cache-Control": "no-cache, no-store",
          "Content-Type": "application/x-ndjson; charset=utf-8",
          "X-Accel-Buffering": "no",
        },
      },
    );
  } catch (error) {
    const status = error instanceof ZodError ? 400 : 500;
    return Response.json(
      {
        error:
          status === 400
            ? "Select between one and five valid resolved companies."
            : publicErrorMessage(error),
      },
      { status },
    );
  }
}
