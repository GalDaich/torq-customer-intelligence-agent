import { randomUUID } from "node:crypto";
import { ZodError } from "zod";
import { logBackend } from "@/lib/logger";
import { resolveCompanyName, normalizeCompanyNames } from "@/lib/resolution";
import { ResolveRequestSchema, ResolveResponseSchema } from "@/lib/schemas";
import { publicErrorMessage } from "@/lib/tools";

export async function POST(request: Request) {
  const batchId = randomUUID();
  const startedAt = Date.now();
  try {
    const body = ResolveRequestSchema.parse(await request.json());
    const companies = normalizeCompanyNames(body.companies);
    logBackend({
      level: "info",
      event: "resolution_batch_started",
      message: "Company resolution batch started.",
      batchId,
      stage: "resolution",
      status: "started",
      totalCompanies: companies.length,
    });
    const resolutions = await Promise.all(
      companies.map(async (name) => {
        const companyStartedAt = Date.now();
        logBackend({
          level: "info",
          event: "company_resolution_started",
          message: "Company identity resolution started.",
          batchId,
          companyName: name,
          stage: "resolution",
          status: "started",
        });
        try {
          const resolution = await resolveCompanyName(name);
          logBackend({
            level: resolution.status === "not_found" ? "warn" : "info",
            event: "company_resolution_completed",
            message: `Company identity resolution completed with status ${resolution.status}.`,
            batchId,
            researchId: resolution.researchId,
            companyName: name,
            stage: "resolution",
            status: "completed",
            candidateCount: resolution.candidates.length,
            durationMs: Date.now() - companyStartedAt,
          });
          return resolution;
        } catch (error) {
          logBackend({
            level: "error",
            event: "company_resolution_failed",
            message: publicErrorMessage(error),
            batchId,
            companyName: name,
            stage: "resolution",
            status: "failed",
            durationMs: Date.now() - companyStartedAt,
          });
          throw error;
        }
      }),
    );
    logBackend({
      level: "info",
      event: "resolution_batch_completed",
      message: "Company resolution batch completed.",
      batchId,
      stage: "resolution",
      status: "completed",
      totalCompanies: companies.length,
      durationMs: Date.now() - startedAt,
    });
    return Response.json(ResolveResponseSchema.parse({ resolutions }));
  } catch (error) {
    const status = error instanceof ZodError || (error instanceof Error && error.message.startsWith("Enter between"))
      ? 400
      : 502;
    const message = status === 400 ? "Enter between one and five unique company names or domains." : publicErrorMessage(error);
    logBackend({
      level: "error",
      event: "resolution_batch_failed",
      message,
      batchId,
      stage: "resolution",
      status: "failed",
      durationMs: Date.now() - startedAt,
    });
    return Response.json({ error: message }, { status });
  }
}
