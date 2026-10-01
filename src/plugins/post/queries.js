import { getCollection } from "astro:content";
import { postPathsFromEntries, publishedPostsFromEntries } from "./paths.js";

export async function getPublishedPosts() {
  return publishedPostsFromEntries(await getCollection("post"));
}

export async function getPostPaths(options) {
  return postPathsFromEntries(await getCollection("post"), options);
}
