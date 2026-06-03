import { describe, expect, it } from "vitest";
import {
  AssetSchema,
  AttentionPrioritySchema,
  AvailabilitySchema,
  DebtStatusSchema,
  DebtTypeSchema,
  PaymentRecordTypeSchema,
  PaymentStatusSchema,
  SourceSchema,
  StorageStatusSchema,
  StorageSubtypeSchema,
  StorageTypeSchema
} from "@/domain/enums";

describe("domain enums", () => {
  it("accepts real MVP values", () => {
    expect(AssetSchema.parse("USDT")).toBe("USDT");
    expect(StorageTypeSchema.parse("trusted_person")).toBe("trusted_person");
    expect(StorageSubtypeSchema.parse("savings_account")).toBe("savings_account");
    expect(AvailabilitySchema.parse("immediate")).toBe("immediate");
    expect(AttentionPrioritySchema.parse("urgent")).toBe("urgent");
    expect(StorageStatusSchema.parse("check")).toBe("check");
    expect(DebtTypeSchema.parse("work_receivable")).toBe("work_receivable");
    expect(DebtStatusSchema.parse("scheduled")).toBe("scheduled");
    expect(PaymentRecordTypeSchema.parse("planned")).toBe("planned");
    expect(PaymentStatusSchema.parse("expected")).toBe("expected");
    expect(SourceSchema.parse("telegram_text")).toBe("telegram_text");
  });

  it("rejects typo values", () => {
    expect(() => DebtStatusSchema.parse("платит")).toThrow();
  });
});
