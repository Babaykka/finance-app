import type { Asset } from "./enums";

export function normalizeAmount(value: string | number): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid amount: ${value}`);
    }
    return value;
  }
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  if (normalized.length === 0) {
    throw new Error("Invalid amount: empty value");
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid amount: ${value}`);
  }
  return parsed;
}

export function formatMoney(amount: number, asset: Asset): string {
  const formatted = new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2
  })
    .format(amount)
    .replace(/[\u00a0\u202f]/g, " ");
  return `${formatted} ${asset}`;
}
