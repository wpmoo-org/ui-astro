import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { getEntryHref } from "@wpmoo/astro/context";
import {
  getTermEntries,
  getTaxonomyTerms,
} from "@wpmoo/astro/taxonomies/queries";
import { sectionMetadata } from "../sections";

export const GET: APIRoute = async () => {
  const pages = await getCollection("page");
  const page = pages.find((entry) => entry.id === "editable.md");
  const plain = pages.find((entry) => entry.id === "plain.md");
  const sample = (await getCollection("sample")).find(
    (entry) => entry.id === "member",
  );
  if (!page || !plain || !sample)
    throw new Error("The authored file consumer lost a required entry");
  return Response.json({
    ids: [page.id, plain.id, sample.id],
    hrefs: [
      getEntryHref("page", page),
      getEntryHref("page", plain),
      getEntryHref("sample", sample),
    ],
    page: page.data,
    plain: plain.data,
    sample: sample.data,
    termItems: (await getTermEntries("category", "child")).map(
      (item) => item.id,
    ),
    terms: await getTaxonomyTerms("category"),
    sectionKinds: Object.keys(sectionMetadata),
  });
};
