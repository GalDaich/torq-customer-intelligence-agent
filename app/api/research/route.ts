import { ZodError } from "zod";
import { runCompanyResearch } from "@/lib/graph";
import {
  ResearchRequestSchema,
  ResearchResponseSchema,
  type CompanyReport,
  type ResolvedCompany,
} from "@/lib/schemas";
import { publicErrorMessage } from "@/lib/tools";

type ResearchInput = {
  researchId: string;
  company: ResolvedCompany;
};

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

export async function POST(request: Request) {
  try {
    const body = ResearchRequestSchema.parse(await request.json());
    return Response.json(await executeResearchBatch(body.companies));
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
