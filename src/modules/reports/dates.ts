import { z } from "zod";
export const presets = [
  "today",
  "yesterday",
  "last7",
  "last30",
  "month",
  "previous-month",
  "financial-year",
  "custom",
] as const;
export function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
export function dayInZone(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function shiftDay(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function midnight(day: string, timezone: string) {
  const wanted = Date.parse(`${day}T00:00:00Z`);
  let value = wanted;
  for (let i = 0; i < 5; i++) {
    const p = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(value));
    const get = (k: string) => p.find((x) => x.type === k)!.value;
    const represented = Date.parse(
      `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`,
    );
    const next = value + wanted - represented;
    if (next === value) return new Date(value);
    value = next;
  }
  return new Date(value);
}
export const dateQuery = z.object({
  preset: z.enum(presets).default("month"),
  from: z.union([z.iso.date(), z.literal("")]).default(""),
  to: z.union([z.iso.date(), z.literal("")]).default(""),
  knowledgeAsOf: z.iso.datetime({ offset: true }).optional(),
});
export function resolveRange(
  q: z.infer<typeof dateQuery>,
  timezone: string,
  now = new Date(),
) {
  const today = dayInZone(now, timezone);
  let from = today,
    to = today;
  switch (q.preset) {
    case "yesterday":
      from = to = shiftDay(today, -1);
      break;
    case "last7":
      from = shiftDay(today, -6);
      break;
    case "last30":
      from = shiftDay(today, -29);
      break;
    case "month":
      from = `${today.slice(0, 7)}-01`;
      break;
    case "previous-month":
      to = shiftDay(`${today.slice(0, 7)}-01`, -1);
      from = `${to.slice(0, 7)}-01`;
      break;
    case "financial-year":
      from = `${Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 4 ? 1 : 0)}-04-01`;
      break;
    case "custom":
      from = q.from;
      to = q.to;
      break;
  }
  if (
    !from ||
    !to ||
    from > to ||
    to > today ||
    from < "2000-01-01" ||
    Date.parse(to) - Date.parse(from) > 366 * 10 * 86400000
  )
    throw new Error("INVALID_REPORT_DATES");
  const knowledge = q.knowledgeAsOf ? new Date(q.knowledgeAsOf) : now;
  if (knowledge > now) throw new Error("INVALID_REPORT_DATES");
  const start = midnight(from, timezone),
    end = midnight(shiftDay(to, 1), timezone);
  const cutoff = new Date(Math.min(end.getTime(), knowledge.getTime()));
  return {
    from,
    to,
    timezone,
    start,
    end,
    cutoff,
    knowledgeAsOf: knowledge.toISOString(),
    preset: q.preset,
  };
}
export function bucket(
  date: Date,
  timezone: string,
  period: "daily" | "weekly" | "monthly",
) {
  const day = dayInZone(date, timezone);
  if (period === "monthly") return day.slice(0, 7);
  if (period === "weekly") {
    const d = new Date(`${day}T12:00:00Z`);
    return shiftDay(day, -((d.getUTCDay() + 6) % 7));
  }
  return day;
}
