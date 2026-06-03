import { endOfMonth, format, isValid, parseISO } from "date-fns";

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const MOSCOW_TIMEZONE = "Europe/Moscow";

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

export function dateToMoscowDateIso(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MOSCOW_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const valueByType = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return normalizeDateOnly(`${valueByType.year}-${valueByType.month}-${valueByType.day}`);
}
