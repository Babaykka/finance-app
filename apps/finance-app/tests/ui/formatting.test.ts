import { describe, expect, it } from "vitest";
import { formatMoney } from "@/domain/money";

describe("UI formatting", () => {
  it("renders ruble and USDT balances compactly", () => {
    expect(formatMoney(1784000, "RUB")).toBe("1 784 000 RUB");
    expect(formatMoney(8431, "USDT")).toBe("8 431 USDT");
  });
});
