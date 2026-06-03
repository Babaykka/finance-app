import { endOfMonth, format, isValid, parseISO } from "date-fns";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeDateOnly(isoDate: string): string {
  if (!DATE_ONLY_PATTERN.test(isoDate)) {
    throw new Error(`Invalid date: ${isoDate}`);
  }
  const parsed = parseISO(isoDate);
  if (!isValid(parsed)) {
    throw new Error(`Invalid date: ${isoDate}`);
  }
  return format(parsed, "yyyy-MM-dd");
}

export function endOfMonthIso(currentIsoDate: string): string {
  return format(endOfMonth(parseISO(normalizeDateOnly(currentIsoDate))), "yyyy-MM-dd");
}
