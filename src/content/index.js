import { z } from "astro/zod";
import { layoutSchema } from "../config/index.js";
import { authoredDate, isTimezoneQualifiedDate } from "./dates.js";

const recordId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const markdownExtension = /\.(?:md|mdx)$/u;
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
  if (entry.status === "future" && entry.published_at && !isTimezoneQualifiedDate(entry.published_at)) {
    context.addIssue({ code: "custom", path: ["published_at"], message: "future status requires a timezone-qualified datetime" });
  }
  if (entry.status === "publish" && entry.published_at instanceof Date && entry.published_at.getTime() > Date.now()) {
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
