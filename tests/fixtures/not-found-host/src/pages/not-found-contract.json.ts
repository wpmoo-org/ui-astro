import { getNotFoundOptions } from "@wpmoo/astro/not-found";
export const GET = () =>
  new Response(
    JSON.stringify([getNotFoundOptions("en"), getNotFoundOptions("de")]),
    { headers: { "Content-Type": "application/json" } },
  );
