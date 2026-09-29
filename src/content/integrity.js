import { readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { sourceEntryId } from "./index.js";

function inside(parent, child) {
  const path = relative(parent, child);
  return path === "" || path !== ".." && !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(path);
}

function localPath(value, label) {
  const url = value instanceof URL ? value : new URL(value);
  if (url.protocol !== "file:" || url.host || url.search || url.hash) {
    throw new TypeError(`${label} must be a local file URL`);
  }
  return fileURLToPath(url);
}

export function validateSelectedCollections(collections, selected) {
  if (!collections || typeof collections !== "object") throw new TypeError("host collections export is missing");
  for (const id of selected) {
    const collection = collections[id];
    if (!Object.hasOwn(collections, id) || !collection) {
      throw new TypeError(`${id} collection is not declared in the host content config`);
    }
    if (!collection.loader || typeof collection.loader.name !== "string" ||
        !collection.schema || typeof collection.schema.safeParse !== "function") {
      throw new TypeError(`${id} collection needs a native loader and static schema`);
    }
  }
}

export async function validateMarkdownSource({ collection, root, base, formats, entries }) {
  if (!Array.isArray(entries) || !Array.isArray(formats) || !formats.length) {
    throw new TypeError(`${collection} source needs loaded entries and declared formats`);
  }
  const rootPath = await realpath(localPath(root, `${collection} root`));
  const basePath = localPath(base, `${collection} source base`);
  if (!inside(rootPath, basePath)) throw new TypeError(`${collection} source base escapes the host root`);
  const actualBase = await realpath(basePath).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (actualBase && !inside(rootPath, actualBase)) {
    throw new TypeError(`${collection} source base resolves outside the host root`);
  }
  if (actualBase && !(await stat(actualBase)).isDirectory()) {
    throw new TypeError(`${collection} source base must be a directory`);
  }
  const expected = new Map();
  async function visit(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (item.name.startsWith(".")) continue;
      const path = join(directory, item.name);
      if (item.isDirectory()) {
        await visit(path);
        continue;
      }
      if (item.isSymbolicLink()) throw new TypeError(`${collection} source contains a symlink: ${path}`);
      if (!item.isFile()) continue;
      const extension = item.name.endsWith(".mdx") ? "mdx" : item.name.endsWith(".md") ? "md" : null;
      if (!extension || !formats.includes(extension)) continue;
      const real = await realpath(path);
      if (!inside(rootPath, real) || !inside(actualBase, real)) {
        throw new TypeError(`${collection} source file resolves outside its declared base: ${path}`);
      }
      const id = sourceEntryId({ entry: relative(actualBase, real).split("\\").join("/") });
      expected.set(id, relative(rootPath, real).split("\\").join("/"));
    }
  }
  if (actualBase) await visit(actualBase);

  const loaded = new Map();
  for (const entry of entries) {
    if (entry?.collection !== collection || typeof entry.id !== "string") {
      throw new TypeError(`${collection} loaded entry has the wrong collection or ID`);
    }
    if (loaded.has(entry.id)) throw new TypeError(`${collection} loaded duplicate source ID ${entry.id}`);
    loaded.set(entry.id, entry);
    if (!expected.has(entry.id)) throw new TypeError(`${collection} loaded ${entry.id} is undeclared by its source`);
    if (entry.filePath !== expected.get(entry.id)) {
      throw new TypeError(`${collection} ${entry.id} filePath differs from its declared source`);
    }
  }
  for (const id of expected.keys()) {
    if (!loaded.has(id)) throw new TypeError(`${collection} source ${id} is missing from the native collection`);
  }
}
