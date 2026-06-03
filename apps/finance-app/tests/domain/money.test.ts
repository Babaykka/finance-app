import { describe, expect, it } from "vitest";
import { formatMoney, normalizeAmount } from "@/domain/money";

describe("money helpers", () => {
  it("normalizes comma strings", () => {
    expect(normalizeAmount("6,5")).toBe(6.5);
    expect(normalizeAmount("804 000")).toBe(804000);
  });

  it("rejects empty and non-finite amounts", () => {
    expect(() => normalizeAmount("")).toThrow();
    expect(() => normalizeAmount("   ")).toThrow();
    expect(() => normalizeAmount(Number.NaN)).toThrow();
    expect(() => normalizeAmount(Number.POSITIVE_INFINITY)).toThrow();
  });

  it("formats money for Russian display", () => {
    expect(formatMoney(25000, "RUB")).toBe("25 000 RUB");
    expect(formatMoney(7331, "USDT")).toBe("7 331 USDT");
  });
});
