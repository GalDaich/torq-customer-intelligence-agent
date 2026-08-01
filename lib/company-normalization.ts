import { ChatOpenAI } from "@langchain/openai";
import { awaitAllCallbacks } from "@langchain/core/callbacks/promises";
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

type CandidateIdentityBatch = z.infer<typeof CandidateIdentityBatchSchema>;

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
  // The model may improve display text and ordering, but it cannot add, remove, or
  // replace provider-discovered candidate IDs and their authoritative URLs.
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

  const discoveredById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return parsed.candidates.map((normalized) => {
    const candidate = discoveredById.get(normalized.candidateId);
    if (!candidate) {
      throw new ProtectedBoundaryError("Company identity normalization invented a candidate.");
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

  // Identity normalization is separate from the later company graph. Its trace still
  // shares the research UUID so the two operations can be correlated in LangSmith.
  const operation = "normalize_company_identity";

  try {
    const normalizer = new ChatOpenAI({
      apiKey: requireServerEnv("OPENAI_API_KEY"),
      model: requireServerEnv("OPENAI_MODEL"),
      maxRetries: 0,
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
  } finally {
    // LangSmith submits callbacks in the background by default. Explicitly drain the
    // shared queue before a serverless resolution request can be suspended.
    await awaitAllCallbacks();
  }
}
