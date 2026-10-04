import type { APIRoute } from "astro";
import {
  getEntryHref,
  getSiteContext,
  getSiteNavigation,
} from "@wpmoo/astro/context";
import { getPublishedPages } from "@wpmoo/astro/plugins/page/queries";

export const GET: APIRoute = async () => {
  const context = getSiteContext();
  const contact = (
    await getPublishedPages({ locale: context.i18n?.defaultLocale })
  ).find((entry) => entry.data.translationKey === "contact");
  if (!contact) throw new Error("The preview Contact translation is missing");
  const contactHref = getEntryHref("page", contact);
  return new Response(
    JSON.stringify({
      ...context,
      navigation: await getSiteNavigation(
        contactHref,
        context.i18n?.defaultLocale,
      ),
      contactHref,
    }),
    {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    },
  );
};
