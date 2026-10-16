import { getCollection } from "astro:content";
import { getEntryHref } from "@wpmoo/astro/context";
export const GET = async () =>
  Response.json(
    (await getCollection("project")).map((entry) => ({
      id: entry.id,
      href: getEntryHref("project", entry),
    })),
  );
