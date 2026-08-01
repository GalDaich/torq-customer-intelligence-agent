import { ZodError } from "zod";
import { resolveCompanyName, normalizeCompanyNames } from "@/lib/resolution";
import { ResolveRequestSchema, ResolveResponseSchema } from "@/lib/schemas";
import { assertResolutionEnvironment, publicErrorMessage } from "@/lib/tools";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = request.headers.get("x-vercel-id");
  try {
    // Resolution discovers possibilities only. The browser must still record an explicit
    // candidate, manual website, or discard decision before research is authorized.
    const body = ResolveRequestSchema.parse(await request.json());
    const companies = normalizeCompanyNames(body.companies);
    console.info(
      JSON.stringify({
        level: "info",
        message: "Company resolution started.",
        route: "/api/resolve",
        requestId,
        companyCount: companies.length,
      }),
    );
    assertResolutionEnvironment();
    const resolutions = await Promise.all(companies.map((name) => resolveCompanyName(name)));
    console.info(
      JSON.stringify({
        level: "info",
        message: "Company resolution completed.",
        route: "/api/resolve",
        requestId,
        companyCount: companies.length,
        durationMs: Date.now() - startedAt,
      }),
    );
    return Response.json(ResolveResponseSchema.parse({ resolutions }));
  } catch (error) {
    const status = error instanceof ZodError || (error instanceof Error && error.message.startsWith("Enter between"))
      ? 400
      : 502;
    const message = status === 400 ? "Enter between one and five unique company names or domains." : publicErrorMessage(error);
    console.error(
      JSON.stringify({
        level: "error",
        message: "Company resolution failed.",
        route: "/api/resolve",
        requestId,
        status,
        durationMs: Date.now() - startedAt,
        publicMessage: message,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage:
          error instanceof Error
            ? error.message
            : "A non-Error value was thrown.",
      }),
    );
    return Response.json({ error: message }, { status });
  }
}
