import test from "node:test";
import assert from "node:assert/strict";
import {
  defineSite,
  resolvePageOptions,
  resolveParts,
} from "../packages/astro/src/config/index.js";

const heading = (alignment) => ({ parts: { pageHeader: { alignment } } });

test("heading alignment has one start fallback for every content type and view", () => {
  assert.equal(resolveParts().pageHeader.alignment, "start");
  const site = defineSite({});
  for (const type of ["page", "post", "category"]) {
    for (const view of ["single", "archive"]) {
      assert.equal(resolvePageOptions(site, type, view).parts.pageHeader.alignment, "start");
    }
  }
});

test("heading alignment follows site locale type view and entry without leaking overrides", () => {
  const input = {
    defaults: { ...heading("start"), pageWidth: "xl" },
    locales: { de: heading("end") },
    types: {
      page: { views: { single: heading("center") } },
      post: {
        ...heading("center"),
        views: { archive: heading("start") },
      },
    },
  };
  const before = structuredClone(input);
  const site = defineSite(input);
  const alignment = (type, view, entry, locale) =>
    resolvePageOptions(site, type, view, entry, locale).parts.pageHeader.alignment;
  assert.equal(alignment("category", "archive"), "start");
  assert.equal(alignment("category", "archive", undefined, "de"), "end");
  assert.equal(alignment("page", "single", undefined, "de"), "center");
  assert.equal(alignment("post", "single", undefined, "de"), "center");
  assert.equal(alignment("post", "archive", undefined, "de"), "start");
  assert.equal(alignment("post", "archive", heading("end"), "de"), "end");
  assert.equal(alignment("post", "archive", heading(undefined)), "start");
  assert.equal(alignment("post", "archive"), "start");
  const page = resolvePageOptions(site, "page", "single");
  assert.equal(page.pageWidth, "xl");
  assert.equal(page.parts.pageHeader.descriptionVariant, "page-description");
  assert.ok(Object.isFrozen(page.parts.pageHeader));
  assert.deepEqual(input, before);
});

test("heading alignment accepts only the finite logical alignment contract", () => {
  for (const value of ["start", "center", "end"]) {
    assert.equal(resolveParts(heading(value).parts).pageHeader.alignment, value);
  }
  for (const value of ["left", "right", "justify", "", null, 1]) {
    assert.throws(() => resolveParts(heading(value).parts), /pageHeader\.alignment/);
  }
});
