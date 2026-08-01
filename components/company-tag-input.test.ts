import { describe, expect, it } from "vitest";
import { parseCompanyTokens } from "./company-tag-input";

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
});
