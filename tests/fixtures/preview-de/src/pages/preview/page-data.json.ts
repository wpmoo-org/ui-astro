import type { APIRoute } from "astro";
import { getSiteContext } from "@wpmoo/astro/context";

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      lang: getSiteContext().site.defaults.lang,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
