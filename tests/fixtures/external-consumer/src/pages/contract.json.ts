import type { APIRoute } from "astro";
import { getSiteContext } from "@wpmoo/astro/context";
import {
  getPublishedSamples,
  sampleLoopItems,
} from "@wpmoo-test/astro-content/queries";

export const GET: APIRoute = async () => {
  const context = getSiteContext();
  const entries = await getPublishedSamples();
  const privateFailures = [];
  for (const name of [
    "routes/index.astro",
    "routes/[...slug].astro",
    "index.js",
    "package.json",
  ]) {
    try {
      import.meta.resolve(`@wpmoo-test/astro-content/${name}`);
      throw new Error(`Private export ${name} resolved`);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED"
      )
        throw error;
      privateFailures.push(error.code);
    }
  }
  const type = context.plugins[0].contentTypes[0];
  return Response.json({
    ids: entries.map((entry) => entry.id),
    hrefs: sampleLoopItems(entries).map((item) => item.href),
    context,
    sourceKind: type.sourceKind,
    formats: type.formats,
    privateFailures,
  });
};
