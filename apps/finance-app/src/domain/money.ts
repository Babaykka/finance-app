import type { Asset } from "./enums";

export function normalizeAmount(value: string | number): number {
  if (typeof value === "number") {
    return value;
  }
  const normalized = value.replace(/\s/g, "").replace(",", ".");
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
