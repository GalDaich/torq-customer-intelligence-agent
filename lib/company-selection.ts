import {
  ResolvedCompanySchema,
  type CompanyResolution,
  type ResolvedCompany,
} from "./schemas";

// These decisions are created only by explicit user actions in the resolution screen.
export type ResolutionDecision =
  | { kind: "candidate"; candidateId: string }
  | { kind: "manual"; company: ResolvedCompany }
  | { kind: "discarded" };

export type SelectedCompany = {
  researchId: string;
  company: ResolvedCompany;
};

export function companyFromManualWebsite(
  inputName: string,
  websiteInput: string,
): ResolvedCompany {
  // Manual confirmation accepts only a public-looking HTTP(S) origin and strips paths,
  // credentials, and `www` so downstream searches receive one stable company boundary.
  const trimmed = websiteInput.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    throw new Error("Enter a valid company website.");
  }

  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    if (!(["http:", "https:"] as string[]).includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error("invalid protocol");
    }
    const domain = parsed.hostname.replace(/^www\./, "").toLocaleLowerCase();
    if (!domain.includes(".")) throw new Error("invalid public domain");

    return ResolvedCompanySchema.parse({
      inputName: inputName.trim(),
      name: inputName.trim(),
      domain,
      websiteUrl: parsed.origin,
      description: "Official website manually confirmed by the user.",
    });
  } catch {
    throw new Error("Enter a valid public website, such as https://company.com.");
  }
}

export function selectedCompaniesFromDecisions(
  resolutions: CompanyResolution[],
  decisions: Record<string, ResolutionDecision>,
): SelectedCompany[] {
  // Discarded rows disappear from the research batch; undecided rows keep the batch blocked.
  return resolutions.flatMap((resolution) => {
    const decision = decisions[resolution.researchId];
    if (!decision || decision.kind === "discarded") return [];
    if (decision.kind === "manual") {
      return [{ researchId: resolution.researchId, company: decision.company }];
    }

    const candidate = resolution.candidates.find((item) => item.id === decision.candidateId);
    if (!candidate?.domain || !candidate.websiteUrl) return [];
    return [{
      researchId: resolution.researchId,
      company: {
        inputName: resolution.inputName,
        name: candidate.name,
        domain: candidate.domain,
        websiteUrl: candidate.websiteUrl,
        description: candidate.description,
      },
    }];
  });
}

export function everyResolutionDecided(
  resolutions: CompanyResolution[],
  decisions: Record<string, ResolutionDecision>,
): boolean {
  return resolutions.length > 0 && resolutions.every((resolution) => decisions[resolution.researchId]);
}
