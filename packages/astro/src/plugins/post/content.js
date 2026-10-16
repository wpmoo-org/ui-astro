import { entrySchema } from "../../content/index.js";
import { isTimezoneQualifiedDate } from "../../content/dates.js";

export const postSchema = entrySchema.extend({}).superRefine((entry, context) => {
  if (entry.status === "publish" && (!entry.published_at || !isTimezoneQualifiedDate(entry.published_at))) {
    context.addIssue({ code: "custom", path: ["published_at"], message: "published Post requires a timezone-qualified published_at" });
  }
});
