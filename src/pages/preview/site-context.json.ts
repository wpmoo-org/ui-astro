import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { getEntryHref, getSiteContext, getSiteNavigation } from "@wpmoo/astro/context";

export const GET: APIRoute = async () => new Response(JSON.stringify({
  ...getSiteContext(),
  navigation: await getSiteNavigation("/iletisim"),
  contactHref: getEntryHref("page", (await getCollection("page")).find((entry) => entry.id === "contact.md")),
}), {
  headers: { "Content-Type": "application/json; charset=utf-8" },
});
