import { describe, expect, it } from "vitest";
import {
  AssetSchema,
  DebtStatusSchema,
  DebtTypeSchema,
  StorageTypeSchema
} from "@/domain/enums";

describe("domain enums", () => {
  it("accepts real MVP values", () => {
    expect(StorageTypeSchema.parse("trusted_person")).toBe("trusted_person");
    expect(DebtTypeSchema.parse("work_receivable")).toBe("work_receivable");
    expect(DebtStatusSchema.parse("scheduled")).toBe("scheduled");
    expect(AssetSchema.parse("USDT")).toBe("USDT");
  });

  it("rejects typo values", () => {
    expect(() => DebtStatusSchema.parse("платит")).toThrow();
  });
});
