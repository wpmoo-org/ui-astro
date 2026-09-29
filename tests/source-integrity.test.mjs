import assert from "node:assert/strict";
import test from "node:test";

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "astro/zod";

import { runDevContentGate, validateJsonDirectorySource, validateJsonFileSource, validateMarkdownSource, validateSelectedCollections } from "../src/content/integrity.js";

const root = new URL("../", import.meta.url);
const base = new URL("../src/content/page/", import.meta.url);

function entry(id) {
  return {
    id, collection: "page", data: { title: id, status: "publish" },
    filePath: `src/content/page/${id}`,
  };
}

const loaded = [entry("contact.md"), entry("draft.md"), entry("guide/setup.md")];

test("the declared native Markdown source matches every exact loaded file and path", async () => {
  await assert.doesNotReject(() => validateMarkdownSource({
    collection: "page", root, base, formats: ["md"], entries: loaded,
  }));
  await assert.doesNotReject(() => validateMarkdownSource({
    collection: "page", root, base: new URL("../src/content/missing/", import.meta.url), formats: ["md"], entries: [],
  }));
});

test("skipped and unexpected entries fail the complete source-set gate", async () => {
  await assert.rejects(() => validateMarkdownSource({
    collection: "page", root, base, formats: ["md"], entries: loaded.slice(1),
  }), /page.*contact\.md.*missing/i);
  await assert.rejects(() => validateMarkdownSource({
    collection: "page", root, base, formats: ["md"], entries: [...loaded, entry("phantom.md")],
  }), /page.*phantom\.md.*undeclared|page.*phantom\.md.*unexpected/i);
});

test("the same ID from another source path cannot impersonate the declared file", async () => {
  await assert.rejects(() => validateMarkdownSource({
    collection: "page", root, base, formats: ["md"],
    entries: loaded.map((item) => item.id === "contact.md" ? { ...item, filePath: "src/content/other/contact.md" } : item),
  }), /page.*contact\.md.*filePath|page.*contact\.md.*source/i);
  await assert.rejects(() => validateMarkdownSource({
    collection: "page", root, base, formats: ["md"],
    entries: loaded.map((item) => item.id === "contact.md" ? { ...item, filePath: undefined } : item),
  }), /page.*contact\.md.*filePath|page.*contact\.md.*source/i);
});

test("a selected missing collection fails while an empty declared collection remains valid", () => {
  assert.throws(() => validateSelectedCollections({ page: undefined }, ["page"]), /page.*collection|collection.*page/i);
  assert.throws(() => validateSelectedCollections({}, ["page"]), /page.*collection|collection.*page/i);
  assert.doesNotThrow(() => validateSelectedCollections({ page: { loader: { name: "glob-loader" }, schema: { safeParse() {} } } }, ["page"]));
  assert.doesNotThrow(() => validateSelectedCollections({}, []));
});

test("Markdown source containment also accepts a symlinked host root spelling", async () => {
  const directory = await mkdtemp(join(tmpdir(), "moo-astro-md-root-"));
  try {
    await mkdir(join(directory, "content"));
    await writeFile(join(directory, "content/contact.md"), "---\ntitle: Contact\nstatus: publish\n---\n");
    await assert.doesNotReject(() => validateMarkdownSource({
      collection: "page", root: pathToFileURL(`${directory}/`),
      base: pathToFileURL(`${directory}/content/`), formats: ["md"],
      entries: [{ collection: "page", id: "contact.md", filePath: "content/contact.md" }],
    }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const jsonSchema = z.strictObject({
  id: z.string(), title: z.string(), status: z.enum(["publish", "draft"]),
});

test("JSON-directory source binds exact IDs, file paths, and current normalized data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "moo-astro-json-dir-"));
  const basePath = join(directory, "src/content/team");
  const filePath = join(basePath, "alice.json");
  try {
    await mkdir(basePath, { recursive: true });
    await writeFile(filePath, JSON.stringify({ id: "alice", title: "Alice", status: "publish" }));
    const input = {
      collection: "team", root: pathToFileURL(`${directory}/`), base: pathToFileURL(`${basePath}/`),
      schema: jsonSchema,
      entries: [{ collection: "team", id: "alice", filePath: "src/content/team/alice.json", data: { id: "alice", title: "Alice", status: "publish" } }],
    };
    await assert.doesNotReject(() => validateJsonDirectorySource(input));
    await writeFile(filePath, JSON.stringify({ id: "alice", title: "Changed", status: "publish" }));
    await assert.rejects(() => validateJsonDirectorySource(input), /team alice.*data.*current source/i);
    await writeFile(filePath, JSON.stringify({ id: "alice", title: "Alice", status: "publish" }));
    await assert.rejects(() => validateJsonDirectorySource({ ...input, entries: [{ ...input.entries[0], filePath: "src/other/alice.json" }] }), /team alice.*filePath/i);
    await writeFile(join(basePath, "bob.json"), JSON.stringify({ id: "bob", title: "Bob", status: "draft" }));
    await assert.rejects(() => validateJsonDirectorySource(input), /team source bob.*missing/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("JSON-directory candidates must remain flat and filename-identified", async () => {
  const directory = await mkdtemp(join(tmpdir(), "moo-astro-json-shape-"));
  const basePath = join(directory, "records");
  const input = {
    collection: "team", root: pathToFileURL(`${directory}/`), base: pathToFileURL(`${basePath}/`),
    schema: jsonSchema, entries: [],
  };
  try {
    await mkdir(basePath);
    await assert.doesNotReject(() => validateJsonDirectorySource(input));
    await writeFile(join(basePath, "alice.json"), JSON.stringify({ id: "wrong", title: "Alice", status: "publish" }));
    await assert.rejects(() => validateJsonDirectorySource(input), /filename.*id/i);
    await rm(join(basePath, "alice.json"));
    await mkdir(join(basePath, "nested"));
    await assert.rejects(() => validateJsonDirectorySource(input), /nested.*directory/i);
    await rm(join(basePath, "nested"), { recursive: true });
    await writeFile(join(basePath, ".hidden.json"), "{}");
    await assert.rejects(() => validateJsonDirectorySource(input), /hidden.*candidate/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("JSON file source detects stale records and malformed or missing source bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "moo-astro-json-file-"));
  const filePath = join(directory, "people.json");
  const entry = { collection: "team", id: "alice", filePath: "people.json", data: { id: "alice", title: "Alice", status: "publish" } };
  const input = { collection: "team", root: pathToFileURL(`${directory}/`), file: pathToFileURL(filePath), schema: jsonSchema, entries: [entry] };
  try {
    await writeFile(filePath, JSON.stringify([{ id: "alice", title: "Alice", status: "publish" }]));
    await assert.doesNotReject(() => validateJsonFileSource(input));
    await writeFile(filePath, JSON.stringify([{ id: "alice", title: "Updated", status: "publish" }]));
    await assert.rejects(() => validateJsonFileSource(input), /team alice.*data.*current source/i);
    await writeFile(filePath, "{");
    await assert.rejects(() => validateJsonFileSource(input), /team.*malformed JSON/i);
    await rm(filePath);
    await assert.rejects(() => validateJsonFileSource(input), /team.*missing JSON source/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("development request validation completes before rendering and blocks stale content", async () => {
  const order = [];
  const result = await runDevContentGate(async () => { order.push("validate"); }, async () => { order.push("render"); return "ok"; });
  assert.equal(result, "ok");
  assert.deepEqual(order, ["validate", "render"]);
  let rendered = false;
  await assert.rejects(() => runDevContentGate(async () => { throw new Error("stale source"); }, async () => { rendered = true; }), /stale source/);
  assert.equal(rendered, false);
});
