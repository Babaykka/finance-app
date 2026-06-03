import { z } from "zod";

export const AssetSchema = z.enum(["RUB", "AMD", "USDT", "BTC", "ETH", "OTHER_CRYPTO"]);
export type Asset = z.infer<typeof AssetSchema>;

export const StorageTypeSchema = z.enum([
  "bank_account",
  "income_bank_product",
  "cash",
  "crypto_exchange",
  "crypto_wallet",
  "trusted_person",
  "investment",
  "other"
]);
export type StorageType = z.infer<typeof StorageTypeSchema>;

export const StorageSubtypeSchema = z.enum([
  "savings_account",
  "deposit",
  "brokerage",
  "card_account",
  "wallet",
  "not_applicable",
  "other"
]);
export type StorageSubtype = z.infer<typeof StorageSubtypeSchema>;

export const AvailabilitySchema = z.enum([
  "immediate",
  "delayed",
  "restricted",
  "locked_until_date"
]);
export type Availability = z.infer<typeof AvailabilitySchema>;

export const AttentionPrioritySchema = z.enum(["low", "medium", "high", "urgent"]);
export type AttentionPriority = z.infer<typeof AttentionPrioritySchema>;

export const StorageStatusSchema = z.enum(["active", "check", "move", "closed"]);
export type StorageStatus = z.infer<typeof StorageStatusSchema>;

export const DebtTypeSchema = z.enum(["personal_debt", "work_receivable"]);
export type DebtType = z.infer<typeof DebtTypeSchema>;

export const DebtStatusSchema = z.enum([
  "no_agreement",
  "negotiating",
  "scheduled",
  "overdue",
  "closed"
]);
export type DebtStatus = z.infer<typeof DebtStatusSchema>;

export const PaymentRecordTypeSchema = z.enum(["planned", "actual"]);
export type PaymentRecordType = z.infer<typeof PaymentRecordTypeSchema>;

export const PaymentStatusSchema = z.enum([
  "expected",
  "received",
  "partial",
  "overdue",
  "canceled"
]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const SourceSchema = z.enum([
  "web",
  "mini_app",
  "telegram_text",
  "telegram_voice",
  "import",
  "system"
]);
export type Source = z.infer<typeof SourceSchema>;
