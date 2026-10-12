import type { PayrollPeriod } from "../contracts/report.ts";

export function resolvePayrollPeriod(value?: string | null, now = new Date()): PayrollPeriod {
  const current = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
  }).format(now);
  const key = /^\d{4}-(0[1-9]|1[0-2])$/.test(value ?? "") ? String(value) : current;
  const [year, month] = key.split("-").map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextKey = `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
  const start = new Date(`${key}-01T00:00:00+07:00`);
  const end = new Date(`${nextKey}-01T00:00:00+07:00`);
  const endDate = formatLocalDateKey(new Date(end.getTime() - 1));
  return {
    key,
    startIso: start.toISOString(),
    endExclusiveIso: end.toISOString(),
    startDate: `${key}-01`,
    endDate,
    label: `01/${String(month).padStart(2, "0")}/${year} – ${endDate.slice(8, 10)}/${String(month).padStart(2, "0")}/${year}`,
  };
}

function formatLocalDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
