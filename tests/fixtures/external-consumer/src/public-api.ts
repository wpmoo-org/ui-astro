import { sample, type SampleInput } from "@wpmoo-test/astro-content";
import { sampleSchema, type Sample } from "@wpmoo-test/astro-content/content";
import {
  getSamplePaths,
  getPublishedSamples,
  sampleLoopItems,
  type SampleLoopItem,
} from "@wpmoo-test/astro-content/queries";
import Single from "@wpmoo-test/astro-content/views/Single.astro";
import Archive from "@wpmoo-test/astro-content/views/Archive.astro";
import Loop from "@wpmoo-test/astro-content/views/Loop.astro";
import type { ComponentProps } from "astro/types";
import { defineSite, resolvePageOptions } from "@wpmoo/astro/config";
import type { Plugin } from "@wpmoo/astro/plugins";

const input: SampleInput = {
  source: new URL("./data/sample.json", import.meta.url),
};
export const plugin: Plugin = sample(input);
const entry: Sample = sampleSchema.parse({
  id: "checked",
  title: "Checked sample",
  status: "publish",
  body: "Checked body",
  options: { sidebar: null },
});
const site = defineSite();
export const options = resolvePageOptions(
  site,
  "sample",
  "single",
  entry.options,
);
export const singleProps: ComponentProps<typeof Single> = {
  title: entry.title,
  entryContext: { type: "sample", id: entry.id, source: "json" },
};
export async function queryTypes() {
  const entries = await getPublishedSamples();
  const paths = await getSamplePaths();
  const items: SampleLoopItem[] = sampleLoopItems(entries);
  const loopProps: ComponentProps<typeof Loop> = { items };
  const archiveProps: ComponentProps<typeof Archive> = {
    title: "Samples",
    items,
  };
  return { paths, loopProps, archiveProps };
}
// @ts-expect-error The fixture's source contract is finite.
sample({ ...input, sourceKind: "markdown" });
export const invalidProps: ComponentProps<typeof Single> = {
  title: "Invalid",
  // @ts-expect-error Entry identity has a declared JSON source.
  entryContext: { type: "sample", id: "checked", source: "file" },
};
