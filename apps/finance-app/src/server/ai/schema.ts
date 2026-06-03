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

const CreateStorageActionSchema = z.object({
  type: z.literal("create_storage_place"),
  name: z.string(),
  storageType: StorageTypeSchema,
  subtype: StorageSubtypeSchema,
  holderContext: z.string(),
  asset: AssetSchema,
  amount: z.number().nonnegative(),
  amountKind: z.enum(["exact", "equivalent", "estimated"]),
  availability: AvailabilitySchema,
  rate: z.number().optional(),
  interestPaymentDay: z.number().int().min(1).max(31).optional(),
  attentionPriority: AttentionPrioritySchema,
  comment: z.string().optional()
});

const CreateDebtActionSchema = z.object({
  type: z.literal("create_debt"),
  partyName: z.string(),
  debtType: DebtTypeSchema,
  basis: z.string(),
  asset: AssetSchema,
  amount: z.number().positive(),
  status: DebtStatusSchema,
  dueDate: z.string().optional(),
  nextPaymentAmount: z.number().positive().optional(),
  attentionPriority: AttentionPrioritySchema,
  comment: z.string().optional()
});

const RecordDebtPaymentActionSchema = z.object({
  type: z.literal("record_debt_payment"),
  partyName: z.string().optional(),
  debtId: z.string().optional(),
  amount: z.number().positive(),
  asset: AssetSchema,
  paymentDate: z.string(),
  comment: z.string().optional()
});

export const AiActionSchema = z.discriminatedUnion("type", [
  CreateStorageActionSchema,
  CreateDebtActionSchema,
  RecordDebtPaymentActionSchema
]);

export const AiParseResultSchema = z.object({
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  actions: z.array(AiActionSchema),
  needsClarification: z.array(z.string())
});

export type AiParseResult = z.infer<typeof AiParseResultSchema>;
export type AiAction = z.infer<typeof AiActionSchema>;
