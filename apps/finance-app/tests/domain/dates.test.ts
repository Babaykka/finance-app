import { describe, expect, it } from "vitest";
import { endOfMonthIso, normalizeDateOnly } from "@/domain/dates";

describe("date helpers", () => {
  it("keeps explicit ISO dates", () => {
    expect(normalizeDateOnly("2026-06-03")).toBe("2026-06-03");
  });

  it("rejects invalid dates and timestamps", () => {
    expect(() => normalizeDateOnly("2026-02-31")).toThrow();
    expect(() => normalizeDateOnly("2026-06-03T12:00:00Z")).toThrow();
    expect(() => endOfMonthIso("2026-06-03T12:00:00Z")).toThrow();
  });

  it("converts end of month for Moscow-local date context", () => {
    expect(endOfMonthIso("2026-06-03")).toBe("2026-06-30");
  });
});
