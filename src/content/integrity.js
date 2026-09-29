import { readFile, readdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { jsonEntryId, sourceEntryId } from "./index.js";

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
  const declaredRoot = localPath(root, `${collection} root`);
  const rootPath = await realpath(declaredRoot);
  const basePath = localPath(base, `${collection} source base`);
  if (!inside(declaredRoot, basePath)) throw new TypeError(`${collection} source base escapes the host root`);
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

function normalizedJson(schema, raw, collection, id) {
  if (!schema || typeof schema.safeParse !== "function") {
    throw new TypeError(`${collection} JSON source needs a static schema`);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new TypeError(`${collection} ${id} current JSON source fails schema at ${issue.path.join(".")}: ${issue.message}`);
  }
  return result.data;
}

function validateJsonEntries(collection, entries, expected) {
  if (!Array.isArray(entries)) throw new TypeError(`${collection} JSON source needs loaded entries`);
  const loaded = new Set();
  for (const entry of entries) {
    if (entry?.collection !== collection || typeof entry.id !== "string") {
      throw new TypeError(`${collection} loaded entry has the wrong collection or ID`);
    }
    if (loaded.has(entry.id)) throw new TypeError(`${collection} loaded duplicate source ID ${entry.id}`);
    loaded.add(entry.id);
    const source = expected.get(entry.id);
    if (!source) throw new TypeError(`${collection} loaded ${entry.id} is undeclared by its JSON source`);
    if (entry.filePath !== source.filePath) {
      throw new TypeError(`${collection} ${entry.id} filePath differs from its declared JSON source`);
    }
    if (!isDeepStrictEqual(entry.data, source.data)) {
      throw new TypeError(`${collection} ${entry.id} data differs from its current source`);
    }
  }
  for (const id of expected.keys()) {
    if (!loaded.has(id)) throw new TypeError(`${collection} source ${id} is missing from the native collection`);
  }
}

async function jsonRootAndSource(root, source, collection, kind) {
  const declaredRoot = localPath(root, `${collection} root`);
  const rootPath = await realpath(declaredRoot);
  const sourcePath = localPath(source, `${collection} JSON ${kind}`);
  if (!inside(declaredRoot, sourcePath)) throw new TypeError(`${collection} JSON ${kind} escapes the host root`);
  const actual = await realpath(sourcePath).catch((error) => {
    if (error.code === "ENOENT") throw new TypeError(`${collection} missing JSON source ${kind}`);
    throw error;
  });
  if (!inside(rootPath, actual)) throw new TypeError(`${collection} JSON ${kind} resolves outside the host root`);
  const info = await stat(actual);
  if (kind === "directory" ? !info.isDirectory() : !info.isFile()) {
    throw new TypeError(`${collection} JSON ${kind} has the wrong file type`);
  }
  return { rootPath, actual };
}

function parsedJson(text, collection, name) {
  try {
    return JSON.parse(text);
  } catch {
    throw new TypeError(`${collection} malformed JSON source: ${name}`);
  }
}

export async function validateJsonDirectorySource({ collection, root, base, schema, entries }) {
  const { rootPath, actual } = await jsonRootAndSource(root, base, collection, "directory");
  const expected = new Map();
  for (const item of await readdir(actual, { withFileTypes: true })) {
    if (item.isDirectory()) throw new TypeError(`${collection} nested directory is not a JSON-directory source candidate`);
    if (item.isSymbolicLink()) throw new TypeError(`${collection} JSON-directory source contains a symlink`);
    if (!item.isFile()) continue;
    if (!item.name.endsWith(".json")) {
      if (/\.json$/iu.test(item.name)) throw new TypeError(`${collection} JSON candidate has the wrong extension: ${item.name}`);
      continue;
    }
    if (item.name.startsWith(".")) throw new TypeError(`${collection} hidden JSON candidate is not allowed: ${item.name}`);
    const path = join(actual, item.name);
    const raw = parsedJson(await readFile(path, "utf8"), collection, item.name);
    const id = jsonEntryId({ entry: item.name, data: raw });
    const data = normalizedJson(schema, raw, collection, id);
    expected.set(id, { filePath: relative(rootPath, path).split("\\").join("/"), data });
  }
  validateJsonEntries(collection, entries, expected);
}

export async function validateJsonFileSource({ collection, root, file, schema, entries }) {
  const { rootPath, actual } = await jsonRootAndSource(root, file, collection, "file");
  const raw = parsedJson(await readFile(actual, "utf8"), collection, actual);
  if (!Array.isArray(raw) && (raw === null || typeof raw !== "object")) {
    throw new TypeError(`${collection} JSON source must contain an array or ID-keyed object`);
  }
  const values = Array.isArray(raw) ? raw.map((item) => [item?.id, item]) : Object.entries(raw);
  const expected = new Map();
  for (const [id, item] of values) {
    if (typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)) {
      throw new TypeError(`${collection} JSON file entry needs an explicit lowercase kebab id`);
    }
    if (expected.has(id)) throw new TypeError(`${collection} JSON file has duplicate ID ${id}`);
    expected.set(id, {
      filePath: relative(rootPath, actual).split("\\").join("/"),
      data: normalizedJson(schema, item, collection, id),
    });
  }
  validateJsonEntries(collection, entries, expected);
}

export async function runDevContentGate(validate, next) {
  await validate();
  return next();
}
