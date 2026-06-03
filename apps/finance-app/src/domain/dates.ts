import { endOfMonth, format, parseISO } from "date-fns";

export function normalizeDateOnly(isoDate: string): string {
  const parsed = parseISO(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid date: ${isoDate}`);
  }
  return format(parsed, "yyyy-MM-dd");
}

export function endOfMonthIso(currentIsoDate: string): string {
  return format(endOfMonth(parseISO(currentIsoDate)), "yyyy-MM-dd");
}
