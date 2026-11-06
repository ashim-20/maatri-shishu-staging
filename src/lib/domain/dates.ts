export function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kathmandu",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function addDays(date: string, days: number): string {
  if (!isDateOnly(date))
    throw new Error("A confirmed calendar date is required.");
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function addMonths(date: string, months: number): string {
  if (!isDateOnly(date))
    throw new Error("A confirmed calendar date is required.");
  const value = new Date(`${date}T12:00:00Z`);
  const day = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0),
  ).getUTCDate();
  value.setUTCDate(Math.min(day, last));
  return value.toISOString().slice(0, 10);
}
export function dayDifference(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000,
  );
}
export function formatDate(
  date: string | null | undefined,
  locale = "en",
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat(
    locale === "bho" ? "hi-NP" : locale === "ne" ? "ne-NP" : "en-GB",
    { day: "numeric", month: "short", ...options, timeZone: "Asia/Kathmandu" },
  ).format(new Date(date.length === 10 ? `${date}T06:00:00Z` : date));
}
export function ageLabel(dob: string | null, asOf = today()): string {
  if (!dob) return "Age to confirm";
  const days = dayDifference(asOf, dob);
  if (days < 28) return `${Math.max(0, days)} days`;
  const months = Math.floor(days / 30.4375);
  return months < 24 ? `${months} months` : `${Math.floor(months / 12)} years`;
}
