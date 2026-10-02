import type { APIRoute } from "astro";
import { sectionMetadata } from "../sections";

// This emitted module has no renderer, Astro virtual module or CSS dependency.
export const GET: APIRoute = () =>
  new Response(`export default ${JSON.stringify(sectionMetadata)};\n`, {
    headers: { "Content-Type": "application/javascript; charset=utf-8" },
  });
