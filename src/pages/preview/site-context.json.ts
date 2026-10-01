import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { getEntryHref, getSiteContext, getSiteNavigation } from "@wpmoo/astro/context";

export const GET: APIRoute = async () => {
  const contact = (await getCollection("page")).find((entry) => entry.id === "contact.md");
  if (!contact) throw new Error("Preview Page contact.md is missing");
  return new Response(JSON.stringify({
    ...getSiteContext(),
    navigation: await getSiteNavigation("/contact"),
    contactHref: getEntryHref("page", contact),
  }), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
};
