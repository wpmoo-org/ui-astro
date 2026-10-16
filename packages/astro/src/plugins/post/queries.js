import { getCollection } from "astro:content";
import { postPathsFromEntries, publishedPostsFromEntries } from "./paths.js";

export async function getPublishedPosts(options = {}) {
  return publishedPostsFromEntries(await getCollection("post")).filter(
    (entry) =>
      options.locale === undefined || entry.data.locale === options.locale,
  );
}

export async function getPostPaths(options) {
  return postPathsFromEntries(await getCollection("post"), options);
}
