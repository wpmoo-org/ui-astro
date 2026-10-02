import assert from "node:assert/strict";
import test from "node:test";

import { z } from "astro/zod";
import {
  entrySchema,
  jsonEntryId,
  sourceEntryId,
} from "../src/content/index.js";
import { pageSchema } from "../src/plugins/page/content.js";
import { postSchema } from "../src/plugins/post/content.js";
import { defineSite, resolvePageOptions } from "../src/config/index.js";

test("native source IDs retain exact relative MD and MDX filenames", () => {
  assert.equal(
    sourceEntryId({ entry: "index.md", data: { slug: "elsewhere" } }),
    "index.md",
  );
  assert.equal(
    sourceEntryId({ entry: "Guide/Über uns.mdx" }),
    "Guide/Über uns.mdx",
  );
  assert.equal(sourceEntryId({ entry: "about.md" }), "about.md");
  assert.equal(sourceEntryId({ entry: "about.mdx" }), "about.mdx");
  for (const entry of [
    "/about.md",
    "../about.md",
    "guide/../about.md",
    "guide//about.md",
    "guide\\about.md",
    "about.txt",
    "about.MD",
    "a\u0000b.md",
  ]) {
    assert.throws(
      () => sourceEntryId({ entry }),
      /entry|path|extension/i,
      entry,
    );
  }
});

test("JSON directory identity is the exact safe filename and declared ID", () => {
  assert.equal(
    jsonEntryId({
      entry: "team-member.json",
      data: { id: "team-member", slug: "alice" },
    }),
    "team-member",
  );
  for (const entry of [
    "nested/team-member.json",
    ".team-member.json",
    "team-member.JSON",
    "other.json",
    "team-member.json/",
    "team-member.md",
  ]) {
    assert.throws(
      () => jsonEntryId({ entry, data: { id: "team-member" } }),
      /entry|filename|id/i,
      entry,
    );
  }
  assert.throws(
    () =>
      jsonEntryId({ entry: "team-member.json", data: { id: "Team Member" } }),
    /id/i,
  );
});

test("shared entry schema keeps authored content fields and real Date values", () => {
  const parsed = entrySchema.parse({
    title: "  Contact  ",
    description: "Contact us",
    slug: "İletişim",
    status: "publish",
    created_at: "2026-09-27",
    published_at: "2026-09-28T18:25:03+02:00",
    updated_at: "2026-09-29",
    options: { sidebar: null, pageWidth: "lg" },
  });
  assert.equal(parsed.title, "Contact");
  assert.equal(parsed.slug, "İletişim");
  assert.equal(parsed.created_at.toISOString(), "2026-09-27T00:00:00.000Z");
  assert.equal(parsed.published_at.toISOString(), "2026-09-28T16:25:03.000Z");
  assert.equal(parsed.updated_at.toISOString(), "2026-09-29T00:00:00.000Z");
  assert.deepEqual(parsed.options, { sidebar: null, pageWidth: "lg" });
  assert.equal(Object.hasOwn(parsed, "seo"), false);
});

test("entry options preserve replacement arrays, false and null through the public resolver", () => {
  const input = {
    sidebar: null,
    headerWidth: null,
    parts: { content: { utilities: [] } },
  };
  const entry = pageSchema.parse({
    title: "Contact",
    status: "publish",
    options: input,
  });
  const site = defineSite({
    defaults: {
      sidebar: { rail: true, defaultOpen: true },
      headerWidth: "fluid",
      parts: { content: { utilities: ["py-5"] } },
    },
  });
  const options = resolvePageOptions(site, "page", "single", entry.options);
  assert.equal(options.sidebar, null);
  assert.equal(options.headerWidth, null);
  assert.deepEqual(options.parts.content.utilities, []);
  assert.ok(Object.isFrozen(options.parts.content.utilities));
  assert.deepEqual(input.parts.content.utilities, []);
  assert.deepEqual(site.defaults.parts.content.utilities, ["py-5"]);
  const falseEntry = pageSchema.parse({
    title: "Closed",
    status: "publish",
    options: { sidebar: { rail: false, defaultOpen: false } },
  });
  const closed = resolvePageOptions(site, "page", "single", falseEntry.options);
  assert.equal(closed.sidebar.rail, false);
  assert.equal(closed.sidebar.defaultOpen, false);
  assert.equal(
    resolvePageOptions(site, "page", "single").sidebar.defaultOpen,
    true,
  );
});

test("collection layout is rejected with its field and the options migration instruction", () => {
  for (const schema of [entrySchema, pageSchema, postSchema]) {
    for (const layout of [{ sidebar: null }, "./Layout.astro"]) {
      const input = { title: "Legacy", status: "draft", layout };
      assert.throws(() => schema.parse(input), /layout.*options/s);
      assert.throws(
        () => schema.parse(JSON.parse(JSON.stringify(input))),
        /layout.*options/s,
      );
    }
  }
  assert.throws(
    () =>
      entrySchema.parse({
        title: "Invalid",
        status: "draft",
        options: { invented: true },
      }),
    /invented/,
  );
  assert.throws(
    () =>
      entrySchema.parse({
        title: "Invalid",
        status: "draft",
        options: "./Layout.astro",
      }),
    /options/,
  );
});

test("publication state and dates reject ambiguous or invented metadata", () => {
  assert.equal(
    entrySchema.parse({ title: "A", status: "draft" }).status,
    "draft",
  );
  assert.equal(
    entrySchema.parse({ title: "A", status: "pending" }).status,
    "pending",
  );
  assert.equal(
    entrySchema.parse({
      title: "A",
      status: "future",
      published_at: "2000-01-01T10:00:00Z",
    }).status,
    "future",
  );
  assert.throws(
    () => entrySchema.parse({ title: " ", status: "draft" }),
    /title|small/i,
  );
  assert.throws(() => entrySchema.parse({ title: "A" }), /status/i);
  assert.throws(
    () => entrySchema.parse({ title: "A", status: "archive" }),
    /status|enum/i,
  );
  assert.throws(
    () =>
      entrySchema.parse({
        title: "A",
        status: "draft",
        seo: { title: "Manual" },
      }),
    /seo|unrecognized/i,
  );
  assert.throws(
    () => entrySchema.parse({ title: "A", status: "future" }),
    /published_at/i,
  );
  assert.throws(
    () =>
      entrySchema.parse({
        title: "A",
        status: "future",
        published_at: "2000-01-01",
      }),
    /published_at|timezone/i,
  );
  assert.throws(
    () =>
      entrySchema.parse({
        title: "A",
        status: "publish",
        published_at: "2999-01-01T10:00:00Z",
      }),
    /published_at|future/i,
  );
  for (const value of [
    new Date("2026-09-29"),
    20260929,
    "2026-02-30",
    "2026-09-29T10:00:00",
    "2026-09-29T25:00:00Z",
  ]) {
    assert.throws(
      () =>
        entrySchema.parse({ title: "A", status: "draft", created_at: value }),
      /created_at|date|ISO/i,
      String(value),
    );
  }
});

test("Page schema adds navigation fields and stays extendable for bound native references", () => {
  const linked = pageSchema.extend({
    taxonomies: z
      .strictObject({ category: z.array(z.string()).default([]) })
      .optional(),
  });
  const parsed = linked.parse({
    title: "About",
    status: "publish",
    navOrder: 3,
    navLabel: "Our team",
    taxonomies: { category: ["company"] },
  });
  assert.equal(parsed.navOrder, 3);
  assert.equal(parsed.navLabel, "Our team");
  assert.deepEqual(parsed.taxonomies, { category: ["company"] });
  assert.throws(
    () =>
      pageSchema.parse({
        title: "A",
        status: "publish",
        taxonomies: { category: [] },
      }),
    /taxonomies|unrecognized/i,
  );
  assert.throws(
    () => pageSchema.parse({ title: "A", status: "publish", navOrder: -1 }),
    /navOrder|small/i,
  );
  assert.throws(
    () =>
      pageSchema.parse({
        title: "A",
        status: "publish",
        layout: "/layout.astro",
      }),
    /layout|object/i,
  );
});

test("content and Page schemas resolve from their public package paths", async () => {
  const content = await import("@wpmoo/astro/content");
  const page = await import("@wpmoo/astro/plugins/page/content");
  assert.equal(content.entrySchema, entrySchema);
  assert.equal(content.sourceEntryId, sourceEntryId);
  assert.equal(content.jsonEntryId, jsonEntryId);
  assert.equal(page.pageSchema, pageSchema);
});
