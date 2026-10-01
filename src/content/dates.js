import { z } from "astro/zod";

const calendarDate = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2}))?$/u;
const timezoneQualified = new WeakSet();

function validDate(value) {
  const match = calendarDate.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, fraction = "", zone] = match;
  if (!hour) {
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }
  if (+hour > 23 || +minute > 59 || +second > 59) return false;
  const offset = zone === "Z" ? 0 :
    (zone[0] === "+" ? 1 : -1) * (+zone.slice(1, 3) * 60 + +zone.slice(4));
  if (zone !== "Z" && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59)) return false;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return false;
  const local = new Date(parsed.getTime() + offset * 60_000);
  return local.toISOString().slice(0, 23) ===
    `${year}-${month}-${day}T${hour}:${minute}:${second}.${fraction.padEnd(3, "0")}`;
}

export const authoredDate = z.string()
  .refine(validDate, "must be a valid ISO date or timezone-qualified datetime")
  .transform((value) => {
    const date = new Date(value);
    if (value.includes("T")) timezoneQualified.add(date);
    return date;
  });

export function isTimezoneQualifiedDate(date) {
  return timezoneQualified.has(date);
}
