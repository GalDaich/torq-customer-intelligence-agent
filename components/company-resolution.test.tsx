import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CompanyResolutionList } from "./company-resolution";

describe("company resolution list", () => {
  it("renders every explicit decision path without preselecting a unique match", () => {
    const researchId = "bfe869fc-6514-425a-9a2d-5682a1ef4582";
    const html = renderToStaticMarkup(
      <CompanyResolutionList
        resolutions={[{
          researchId,
          inputName: "Google",
          status: "unique",
          candidates: [{
            id: `${researchId}:C1`,
            name: "Google",
            domain: "google.com",
            websiteUrl: "https://google.com",
            description: "Google provides online products.",
            sourceIds: [],
          }],
          sources: [],
          gaps: [],
        }]}
        decisions={{}}
        onSelect={vi.fn()}
        onDiscard={vi.fn()}
        onRestore={vi.fn()}
        onManualWebsite={vi.fn(() => null)}
      />,
    );

    expect(html).toContain("google.com");
    expect(html).toContain("Confirmation required");
    expect(html).toContain("Enter the official website manually");
    expect(html).toContain("None of these — discard company");
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('aria-pressed="true"');
  });
});
