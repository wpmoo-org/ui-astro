import { entrySchema, type Entry } from "@wpmoo/astro/content";
import { pageSchema, type Page } from "@wpmoo/astro/plugins/page/content";

const entry: Entry = entrySchema.parse({ title: "Contact", status: "publish" });
const page: Page = pageSchema.parse({ title: "Contact", status: "publish", navOrder: 2 });
const published: "publish" | "draft" | "pending" | "future" = entry.status;
const created: Date | undefined = page.created_at;
const order: number | undefined = page.navOrder;

// @ts-expect-error status is a closed enum
const invalid: Entry = { title: "Contact", status: "archive" };

void [published, created, order, invalid];
