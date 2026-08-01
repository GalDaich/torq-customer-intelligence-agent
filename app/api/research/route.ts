import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import {
  runCompanyResearch,
  type ResearchProgressUpdate,
} from "@/lib/graph";
import { logBackend } from "@/lib/logger";
import {
  ResearchCompleteEventSchema,
  ResearchProgressEventSchema,
  ResearchRequestSchema,
  ResearchResponseSchema,
  ResearchStreamErrorEventSchema,
  type CompanyReport,
  type ResolvedCompany,
} from "@/lib/schemas";
import { publicErrorMessage } from "@/lib/tools";

type ResearchInput = {
  researchId: string;
  company: ResolvedCompany;
};

type ProgressRunner = (
  researchId: string,
  company: ResolvedCompany,
  onProgress?: (update: ResearchProgressUpdate) => void | Promise<void>,
) => Promise<CompanyReport>;

export async function executeResearchBatch(
  companies: ResearchInput[],
  runner: (researchId: string, company: ResolvedCompany) => Promise<CompanyReport> = runCompanyResearch,
) {
  const settled = await Promise.allSettled(
    companies.map(({ researchId, company }) => runner(researchId, company)),
  );
  const reports: CompanyReport[] = [];
  const failures: Array<{ researchId: string; companyName: string; message: string }> = [];

  settled.forEach((result, index) => {
    const input = companies[index];
    if (result.status === "fulfilled") {
      reports.push(result.value);
    } else {
      failures.push({
        researchId: input.researchId,
        companyName: input.company.name,
        message: publicErrorMessage(result.reason),
      });
    }
  });

  return ResearchResponseSchema.parse({ reports, failures });
}

export function createResearchStream(
  companies: ResearchInput[],
  runner: ProgressRunner = runCompanyResearch,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const batchId = randomUUID();
  const totalSteps = companies.length * 6;
  let completedSteps = 0;
  let sequence = 0;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      void (async () => {
        const batchStartedAt = Date.now();
        logBackend({
          level: "info",
          event: "research_batch_started",
          message: "Research batch started.",
          batchId,
          stage: "batch",
          status: "started",
          totalCompanies: companies.length,
        });

        try {
          const outcomes = await Promise.all(
            companies.map(async ({ researchId, company }) => {
              const companyStartedAt = Date.now();
              logBackend({
                level: "info",
                event: "company_research_started",
                message: "Company research started.",
                batchId,
                researchId,
                companyName: company.name,
                status: "started",
              });

              try {
                const report = await runner(researchId, company, async (update) => {
                  if (update.status === "completed" || update.status === "failed") {
                    completedSteps += 1;
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
                  logBackend({
                    level: update.status === "failed" ? "error" : "info",
                    event: `research_stage_${update.status}`,
                    message: update.message,
                    batchId,
                    researchId,
                    companyName: company.name,
                    stage: update.stage,
                    status: update.status,
                    ...(update.durationMs === null ? {} : { durationMs: update.durationMs }),
                  });
                });
                logBackend({
                  level: "info",
                  event: "company_research_completed",
                  message: "Company research completed with a validated report.",
                  batchId,
                  researchId,
                  companyName: company.name,
                  status: "completed",
                  durationMs: Date.now() - companyStartedAt,
                });
                return { report } as const;
              } catch (error) {
                const failure = {
                  researchId,
                  companyName: company.name,
                  message: publicErrorMessage(error),
                };
                logBackend({
                  level: "error",
                  event: "company_research_failed",
                  message: failure.message,
                  batchId,
                  researchId,
                  companyName: company.name,
                  status: "failed",
                  durationMs: Date.now() - companyStartedAt,
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
          logBackend({
            level: response.failures.length > 0 ? "warn" : "info",
            event: "research_batch_completed",
            message: `Research batch completed with ${response.reports.length} reports and ${response.failures.length} failures.`,
            batchId,
            stage: "batch",
            status: "completed",
            totalCompanies: companies.length,
            durationMs: Date.now() - batchStartedAt,
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
          logBackend({
            level: "error",
            event: "research_batch_failed",
            message,
            batchId,
            stage: "batch",
            status: "failed",
            totalCompanies: companies.length,
            durationMs: Date.now() - batchStartedAt,
          });
        } finally {
          controller.close();
        }
      })();
    },
  });
}

export async function POST(request: Request) {
  try {
    const body = ResearchRequestSchema.parse(await request.json());
    return new Response(createResearchStream(body.companies), {
      headers: {
        "Cache-Control": "no-cache, no-store",
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    });
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
