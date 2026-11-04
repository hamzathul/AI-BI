import { describe, expect, it } from "vitest";
import { clarificationFollowUp } from "./clarify";

describe("clarificationFollowUp", () => {
  it("resends the original question with the chosen name", () => {
    expect(
      clarificationFollowUp("What was our revenue?", "gross_revenue"),
    ).toBe("What was our revenue? (use gross_revenue)");
  });

  it("normalizes whitespace so the follow-up reads as one question", () => {
    expect(clarificationFollowUp("  Monthly   revenue  ", "revenue")).toBe(
      "Monthly revenue (use revenue)",
    );
  });
});
