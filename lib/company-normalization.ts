import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { companyIdentityNormalizationMessages } from "../prompts/company-identity-normalization";
import type { CompanyCandidate } from "./schemas";
import { ProtectedBoundaryError, requireServerEnv } from "./tools";

const CandidateIdentitySchema = z
  .object({
    candidateId: z.string().min(1),
    companyName: z.string().trim().min(1).max(100),
    description: z.string().trim().min(1).max(500),
  })
  .strict();

const CandidateIdentityBatchSchema = z
  .object({
    candidates: z.array(CandidateIdentitySchema).min(1).max(4),
  })
  .strict();

export type CandidateIdentityBatch = z.infer<typeof CandidateIdentityBatchSchema>;

export function companyNormalizationTraceConfig(
  input: string,
  context: { researchId: string },
  candidateCount: number,
) {
  return {
    runName: "normalize_company_identity",
    tags: [
      "customer-intelligence",
      "company-resolution",
      "identity-normalization",
      `research:${context.researchId}`,
    ],
    metadata: {
      researchId: context.researchId,
      companyName: input,
      stage: "company_identity_normalization",
      candidateCount,
    },
  };
}

export function applyCandidateNormalizations(
  candidates: CompanyCandidate[],
  output: CandidateIdentityBatch,
): CompanyCandidate[] {
  const parsed = CandidateIdentityBatchSchema.parse(output);
  const expectedIds = new Set(candidates.map((candidate) => candidate.id));
  const returnedIds = new Set(parsed.candidates.map((candidate) => candidate.candidateId));

  if (
    returnedIds.size !== parsed.candidates.length ||
    returnedIds.size !== expectedIds.size ||
    [...returnedIds].some((id) => !expectedIds.has(id))
  ) {
    throw new ProtectedBoundaryError(
      "Company identity normalization returned invalid candidate references.",
    );
  }

  const normalizedById = new Map(
    parsed.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  return candidates.map((candidate) => {
    const normalized = normalizedById.get(candidate.id);
    if (!normalized) {
      throw new ProtectedBoundaryError(
        "Company identity normalization omitted a discovered candidate.",
      );
    }
    return {
      ...candidate,
      name: normalized.companyName,
      description: normalized.description,
    };
  });
}

export async function normalizeCompanyCandidates(
  input: string,
  candidates: CompanyCandidate[],
  context: { researchId: string },
): Promise<CompanyCandidate[]> {
  if (candidates.length === 0) return [];

  const operation = "normalize_company_identity";

  try {
    const normalizer = new ChatOpenAI({
      apiKey: requireServerEnv("OPENAI_API_KEY"),
      model: requireServerEnv("OPENAI_MODEL"),
      maxRetries: 1,
      timeout: 45_000,
    }).withStructuredOutput(CandidateIdentityBatchSchema, {
      name: operation,
      strict: true,
    });
    const output = await normalizer.invoke(
      companyIdentityNormalizationMessages(input, candidates),
      companyNormalizationTraceConfig(input, context, candidates.length),
    );
    return applyCandidateNormalizations(candidates, output);
  } catch (error) {
    if (error instanceof ProtectedBoundaryError) throw error;
    throw new ProtectedBoundaryError(
      "Company identity normalization failed; unnormalized search text was not used.",
    );
  }
}
