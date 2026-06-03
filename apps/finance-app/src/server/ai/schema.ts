import { z } from "zod";
import {
  AssetSchema,
  AttentionPrioritySchema,
  AvailabilitySchema,
  DebtStatusSchema,
  DebtTypeSchema,
  StorageSubtypeSchema,
  StorageTypeSchema
} from "@/domain/enums";
import { normalizeDateOnly } from "@/domain/dates";

const NonEmptyStringSchema = z.string().trim().min(1);
const DateOnlyStringSchema = z.string().refine(
  (value) => {
    try {
      return normalizeDateOnly(value) === value;
    } catch {
      return false;
    }
  },
  { message: "Expected a valid yyyy-MM-dd date" }
);

const CreateStorageActionSchema = z.object({
  type: z.literal("create_storage_place"),
  name: NonEmptyStringSchema,
  storageType: StorageTypeSchema,
  subtype: StorageSubtypeSchema,
  holderContext: NonEmptyStringSchema,
  asset: AssetSchema,
  amount: z.number().nonnegative(),
  amountKind: z.enum(["exact", "equivalent", "estimated"]),
  availability: AvailabilitySchema,
  rate: z.number().optional(),
  interestPaymentDay: z.number().int().min(1).max(31).optional(),
  attentionPriority: AttentionPrioritySchema,
  comment: NonEmptyStringSchema.optional()
});

const CreateDebtActionSchema = z.object({
  type: z.literal("create_debt"),
  partyName: NonEmptyStringSchema,
  debtType: DebtTypeSchema,
  basis: NonEmptyStringSchema,
  asset: AssetSchema,
  amount: z.number().positive(),
  status: DebtStatusSchema,
  dueDate: DateOnlyStringSchema.optional(),
  nextPaymentAmount: z.number().positive().optional(),
  attentionPriority: AttentionPrioritySchema,
  comment: NonEmptyStringSchema.optional()
});

const RecordDebtPaymentActionSchema = z
  .object({
    type: z.literal("record_debt_payment"),
    partyName: NonEmptyStringSchema.optional(),
    debtId: NonEmptyStringSchema.optional(),
    amount: z.number().positive(),
    asset: AssetSchema,
    paymentDate: DateOnlyStringSchema,
    comment: NonEmptyStringSchema.optional()
  })
  .refine((action) => action.partyName !== undefined || action.debtId !== undefined, {
    message: "record_debt_payment requires partyName or debtId"
  });

export const AiActionSchema = z.discriminatedUnion("type", [
  CreateStorageActionSchema,
  CreateDebtActionSchema,
  RecordDebtPaymentActionSchema
]);

export const AiParseResultSchema = z.object({
  confidence: z.number().min(0).max(1),
  summary: NonEmptyStringSchema,
  actions: z.array(AiActionSchema),
  needsClarification: z.array(NonEmptyStringSchema)
});

export type AiParseResult = z.infer<typeof AiParseResultSchema>;
export type AiAction = z.infer<typeof AiActionSchema>;
