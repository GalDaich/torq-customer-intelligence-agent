import { ZodError } from "zod";
import { resolveCompanyName, normalizeCompanyNames } from "@/lib/resolution";
import { ResolveRequestSchema, ResolveResponseSchema } from "@/lib/schemas";
import { publicErrorMessage } from "@/lib/tools";

export async function POST(request: Request) {
  try {
    const body = ResolveRequestSchema.parse(await request.json());
    const companies = normalizeCompanyNames(body.companies);
    const resolutions = await Promise.all(companies.map((name) => resolveCompanyName(name)));
    return Response.json(ResolveResponseSchema.parse({ resolutions }));
  } catch (error) {
    const status = error instanceof ZodError || (error instanceof Error && error.message.startsWith("Enter between"))
      ? 400
      : 502;
    const message = status === 400 ? "Enter between one and five unique company names." : publicErrorMessage(error);
    return Response.json({ error: message }, { status });
  }
}
