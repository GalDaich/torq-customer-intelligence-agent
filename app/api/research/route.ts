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
  const totalSteps = companies.length * RESEARCH_STAGES.length;
  let completedSteps = 0;
  let sequence = 0;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };

      void (async () => {
        try {
          const outcomes = await Promise.all(
            companies.map(async ({ researchId, company }) => {
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
                });
                return { report } as const;
              } catch (error) {
                const failure = {
                  researchId,
                  companyName: company.name,
                  message: publicErrorMessage(error),
                };
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
