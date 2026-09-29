import { getCollection } from "astro:content";
import { pagePathsFromEntries } from "./paths.js";

function compareCodepoint(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function getPublishedPages() {
  return (await getCollection("page"))
    .filter((entry) => entry.data.status === "publish")
    .sort((left, right) =>
      (left.data.navOrder ?? Number.MAX_SAFE_INTEGER) - (right.data.navOrder ?? Number.MAX_SAFE_INTEGER) ||
      compareCodepoint(left.id, right.id));
}

export async function getPagePaths(options) {
  return pagePathsFromEntries(await getCollection("page"), options);
}
