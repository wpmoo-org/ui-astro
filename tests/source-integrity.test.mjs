import assert from "node:assert/strict";
import test, { after } from "node:test";

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "astro/zod";

import { runDevContentGate, validateJsonDirectorySource, validateJsonFileSource, validateMarkdownSource, validateSelectedCollections } from "../src/content/integrity.js";
import { pageSchema } from "../src/plugins/page/content.js";

const directory = await mkdtemp(join(tmpdir(), "moo-astro-native-md-"));
const root = pathToFileURL(`${directory}/`);
const base = new URL("./src/content/page/", root);
await mkdir(new URL("./guide/", base), { recursive: true });
for (const id of ["contact.md", "draft.md", "guide/setup.md"]) {
  await writeFile(new URL(id, base), `---\ntitle: ${id}\nstatus: publish\n---\nBody.\n`);
}
after(() => rm(directory, { recursive: true, force: true }));

function entry(id) {
  return {
    id, collection: "page", data: { title: id, status: "publish" },
    filePath: `src/content/page/${id}`, body: "Body.",
  };
}

const loaded = [entry("contact.md"), entry("draft.md"), entry("guide/setup.md")];

test("the declared native Markdown source matches every exact loaded file and path", async () => {
  await assert.doesNotReject(() => validateMarkdownSource({
    collection: "page", root, base, formats: ["md"], entries: loaded, schema: pageSchema,
  }));
  await assert.doesNotReject(() => validateMarkdownSource({
    collection: "page", root, base: new URL("./missing/", root), formats: ["md"], entries: [], schema: pageSchema,
  }));
});

test("skipped and unexpected entries fail the complete source-set gate", async () => {
  await assert.rejects(() => validateMarkdownSource({
    collection: "page", root, base, formats: ["md"], entries: loaded.slice(1), schema: pageSchema,
  }), /page.*contact\.md.*missing/i);
  await assert.rejects(() => validateMarkdownSource({
    collection: "page", root, base, formats: ["md"], entries: [...loaded, entry("phantom.md")], schema: pageSchema,
  }), /page.*phantom\.md.*undeclared|page.*phantom\.md.*unexpected/i);
});

test("the same ID from another source path cannot impersonate the declared file", async () => {
  await assert.rejects(() => validateMarkdownSource({
    collection: "page", root, base, formats: ["md"], schema: pageSchema,
    entries: loaded.map((item) => item.id === "contact.md" ? { ...item, filePath: "src/content/other/contact.md" } : item),
  }), /page.*contact\.md.*filePath|page.*contact\.md.*source/i);
  await assert.rejects(() => validateMarkdownSource({
    collection: "page", root, base, formats: ["md"], schema: pageSchema,
    entries: loaded.map((item) => item.id === "contact.md" ? { ...item, filePath: undefined } : item),
  }), /page.*contact\.md.*filePath|page.*contact\.md.*source/i);
});

test("the Markdown gate blocks an invalid edit even when the native loader retains its last valid record", async () => {
  const file = new URL("contact.md", base);
  const input = { collection: "page", root, base, formats: ["md"], entries: loaded, schema: pageSchema };
  try {
    await writeFile(file, "---\ntitle: []\nstatus: draft\n---\nInvalid draft.\n");
    await assert.rejects(() => validateMarkdownSource(input), /page contact\.md.*current Markdown.*title/i);
    await writeFile(file, "---\ntitle: contact.md\nstatus: draft\n---\nBody.\n");
    await assert.rejects(() => validateMarkdownSource(input), /page contact\.md.*data.*current source/i);
    await writeFile(file, "---\ntitle: contact.md\nstatus: publish\n---\nEdited body.\n");
    await assert.rejects(() => validateMarkdownSource(input), /page contact\.md.*body.*current source/i);
    const current = loaded.map((item) => item.id === "contact.md" ? { ...item, body: "Edited body." } : item);
    await assert.doesNotReject(() => validateMarkdownSource({ ...input, entries: current }));
    await writeFile(file, "---\ntitle: [\nstatus: draft\n---\nInvalid YAML.\n");
    await assert.rejects(() => validateMarkdownSource(input), /page contact\.md.*malformed Markdown/i);
  } finally {
    await writeFile(file, "---\ntitle: contact.md\nstatus: publish\n---\nBody.\n");
  }
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
      base: pathToFileURL(`${directory}/content/`), formats: ["md"], schema: pageSchema,
      entries: [{ collection: "page", id: "contact.md", filePath: "content/contact.md", body: "", data: { title: "Contact", status: "publish" } }],
    }));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const jsonSchema = z.strictObject({
  id: z.string(), title: z.string(), status: z.enum(["publish", "draft"]),
});

test("taxonomy array mode rejects ID-keyed maps even when native loaded data matches", async () => {
  const directory = await mkdtemp(join(tmpdir(), "moo-astro-taxonomy-array-"));
  const file = pathToFileURL(join(directory, "terms.json"));
  const raw = { root: { id: "root", title: "Root", status: "publish" } };
  const input = { collection: "category", root: pathToFileURL(`${directory}/`), file,
    schema: jsonSchema, arrayOnly: true,
    entries: [{ collection: "category", id: "root", filePath: "terms.json", data: raw.root }] };
  try {
    await writeFile(file, JSON.stringify(raw));
    await assert.rejects(() => validateJsonFileSource(input), /category.*JSON source.*array/);
    await writeFile(file, JSON.stringify([raw.root]));
    await assert.doesNotReject(() => validateJsonFileSource(input));
  } finally { await rm(directory, { recursive: true, force: true }); }
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
