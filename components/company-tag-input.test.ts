import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CompanyTagInput, parseCompanyTokens } from "./company-tag-input";

describe("company tag parsing", () => {
  it("parses comma and newline separated values", () => {
    expect(parseCompanyTokens([], "Acme, Beta\nGamma").companies).toEqual([
      "Acme",
      "Beta",
      "Gamma",
    ]);
  });

  it("deduplicates and reports values beyond the maximum", () => {
    expect(parseCompanyTokens(["Acme"], "acme, B, C, D, E, F")).toEqual({
      companies: ["Acme", "B", "C", "D", "E"],
      overflowCount: 1,
    });
  });

  it("removes the add-another prompt at the five-company limit", () => {
    const html = renderToStaticMarkup(
      createElement(CompanyTagInput, {
        companies: ["Microsoft", "Google", "Nvidia", "Meta", "SpaceX"],
        onChange: () => undefined,
      }),
    );

    expect(html).not.toContain("Add another");
    expect(html).toContain("Remove a company to add a different one.");
    expect(html).toContain("5/5");
  });
});
