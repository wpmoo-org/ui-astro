import { z } from "astro/zod";
import { layoutSchema } from "../config/index.js";

const recordId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const markdownExtension = /\.(?:md|mdx)$/u;
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

const authoredDate = z.string()
  .refine(validDate, "must be a valid ISO date or timezone-qualified datetime")
  .transform((value) => {
    const date = new Date(value);
    if (value.includes("T")) timezoneQualified.add(date);
    return date;
  });

const text = z.string().trim().min(1).refine((value) => !/[\x00-\x1f\x7f]/u.test(value), "must be plain text");

export const entrySchema = z.strictObject({
  title: text,
  description: z.string().optional(),
  slug: z.string().min(1).optional(),
  status: z.enum(["publish", "draft", "pending", "future"]),
  created_at: authoredDate.optional(),
  published_at: authoredDate.optional(),
  updated_at: authoredDate.optional(),
  layout: layoutSchema.optional(),
}).superRefine((entry, context) => {
  if (entry.status === "future" && !entry.published_at) {
    context.addIssue({ code: "custom", path: ["published_at"], message: "future status requires published_at" });
  }
  if (entry.status === "future" && entry.published_at && !timezoneQualified.has(entry.published_at)) {
    context.addIssue({ code: "custom", path: ["published_at"], message: "future status requires a timezone-qualified datetime" });
  }
  if (entry.status === "publish" && entry.published_at && entry.published_at.getTime() > Date.now()) {
    context.addIssue({ code: "custom", path: ["published_at"], message: "publish status cannot have a future published_at" });
  }
});

export function sourceEntryId({ entry }) {
  if (typeof entry !== "string" || !markdownExtension.test(entry) ||
      entry.startsWith("/") || entry.includes("\\") || /[\x00-\x1f\x7f]/u.test(entry) ||
      entry.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new TypeError("source entry must be a safe relative .md or .mdx path");
  }
  return entry;
}

export function jsonEntryId({ entry, data }) {
  const id = data?.id;
  if (typeof id !== "string" || !recordId.test(id) || entry !== `${id}.json`) {
    throw new TypeError("JSON entry filename must exactly match its lowercase kebab id");
  }
  return id;
}
