import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { defineSite, formatDate, layoutSchema, resolvePageOptions, resolveParts } from "../src/config/index.js";

test("date display follows the caller locale and style without changing its instant", () => {
  const date = new Date("2026-10-01T23:30:00Z");
  assert.equal(formatDate(date), "2026-10-01");
  for (const lang of ["en", "de"]) {
    assert.equal(formatDate(date, { lang, style: "long" }),
      new Intl.DateTimeFormat(lang, { dateStyle: "long", timeZone: "UTC" }).format(date));
  }
  assert.equal(date.toISOString(), "2026-10-01T23:30:00.000Z");
  assert.throws(() => formatDate(new Date("invalid")), /date/i);
  assert.throws(() => formatDate(date, { style: "unknown" }), /style/);
  assert.equal(formatDate(date, { formatter: (copy) => { copy.setFullYear(2000); return "Caller date"; } }), "Caller date");
  assert.equal(date.toISOString(), "2026-10-01T23:30:00.000Z");
  assert.throws(() => formatDate(date, { formatter: () => null }), /return text/);
});

test("shared part defaults have one owned immutable fallback", () => {
  const defaults = resolveParts();
  assert.deepEqual(defaults.content.utilities, ["py-4"]);
  assert.deepEqual(defaults.header.contentUtilities, ["d-flex", "align-items-center", "gap-2", "py-2"]);
  assert.equal(defaults.header.trigger.variant, "ghost");
  assert.equal(defaults.loop.dateStyle, "iso");
  assert.ok(Object.isFrozen(defaults.content.utilities));
  assert.ok(Object.isFrozen(defaults.header.trigger));
  assert.deepEqual(layoutSchema.parse({ parts: {} }), { parts: {} });
});

test("part preferences inherit five layers and replace only explicit leaf arrays", () => {
  const input = {
    defaults: { parts: { content: { utilities: ["py-3", "py-md-5"] }, header: { toggleLabel: "Menu" } } },
    types: { post: { parts: { loop: { dateStyle: "medium" } }, views: {
      single: { parts: { header: { trigger: { variant: "outline" } } } },
    } } },
  };
  const retained = structuredClone(input);
  const site = defineSite(input);
  const single = resolvePageOptions(site, "post", "single");
  const page = resolvePageOptions(site, "post", "single", { parts: { content: { utilities: [] } } });
  assert.deepEqual(single.parts.content.utilities, ["py-3", "py-md-5"]);
  assert.deepEqual(page.parts.content.utilities, []);
  assert.equal(page.parts.header.toggleLabel, "Menu");
  assert.equal(page.parts.header.trigger.variant, "outline");
  assert.equal(page.parts.header.trigger.size, "icon-sm");
  assert.equal(resolvePageOptions(site, "post", "archive").parts.header.trigger.variant, "ghost");
  assert.equal(resolvePageOptions(site, "page", "single").parts.loop.dateStyle, "iso");
  assert.deepEqual(input, retained);
  input.defaults.parts.content.utilities.push("py-0");
  assert.deepEqual(single.parts.content.utilities, ["py-3", "py-md-5"]);
  assert.ok(Object.isFrozen(site.types.post.parts.loop));
  assert.ok(Object.isFrozen(page.parts.header.trigger));
});

test("undefined part fields inherit while zero utilities and empty arrays remain explicit", () => {
  const site = defineSite({ defaults: { parts: { content: { utilities: ["py-5"] } } } });
  assert.deepEqual(resolvePageOptions(site, "page", "single", {
    parts: { content: { utilities: undefined }, header: undefined },
  }).parts.content.utilities, ["py-5"]);
  assert.deepEqual(resolvePageOptions(site, "page", "single", {
    parts: { content: { utilities: ["py-0"] }, footer: { utilities: [] } },
  }).parts.content.utilities, ["py-0"]);
});

test("part schema diagnoses unknown regions, unregistered utilities and unsafe values", () => {
  for (const [parts, field] of [
    [{ hero: {} }, "hero"],
    [{ content: { utilities: ["private-padding"] } }, "content.utilities"],
    [{ content: { utilities: ["py-9"] } }, "content.utilities"],
    [{ content: { utilities: "py-3" } }, "content.utilities"],
    [{ content: null }, "content"],
    [{ header: { trigger: { icon: "unknown-glyph" } } }, "header.trigger.icon"],
    [{ loop: { dateStyle: "custom-css" } }, "loop.dateStyle"],
    [{ header: { skipLabel: "" } }, "header.skipLabel"],
  ]) assert.throws(() => resolveParts(parts), (error) => error.message.includes(field), field);
});

test("Typography-owned defaults reject incompatible utility overrides by their public field", () => {
  for (const [pageHeader, field] of [
    [{ titleUtilities: ["fw-normal"] }, "pageHeader.titleUtilities"],
    [{ titleUtilities: ["fw-bold"] }, "pageHeader.titleUtilities"],
    [{ descriptionUtilities: ["text-primary"] }, "pageHeader.descriptionUtilities"],
    [{ descriptionUtilities: ["mb-3"] }, "pageHeader.descriptionUtilities"],
    [{ descriptionUtilities: ["my-md-2"] }, "pageHeader.descriptionUtilities"],
  ]) assert.throws(() => resolveParts({ pageHeader }), (error) => error.message.includes(field));
  assert.deepEqual(resolveParts({ pageHeader: { titleUtilities: ["text-center", "mb-2"], descriptionUtilities: ["text-start", "mt-1"] } }).pageHeader.titleUtilities,
    ["text-center", "mb-2"]);
  assert.deepEqual(resolveParts({ pageHeader: { descriptionVariant: "muted", descriptionUtilities: ["mb-3"] } }).pageHeader.descriptionUtilities, ["mb-3"]);
  assert.deepEqual(resolveParts({ pageHeader: { descriptionUtilities: ["text-body-secondary", "mb-0"] } }).pageHeader.descriptionUtilities,
    ["text-body-secondary", "mb-0"]);
  const site = defineSite({ defaults: { parts: { pageHeader: { descriptionVariant: "muted", descriptionUtilities: ["mb-3"] } } } });
  assert.throws(() => resolvePageOptions(site, "page", "single", { parts: { pageHeader: { descriptionVariant: "page-description" } } }), /pageHeader.descriptionUtilities/);
});

test("registered part defaults exist in the actual published component stylesheet", async () => {
  const css = await readFile(new URL("../node_modules/@wpmoo/ui/dist/assets/css/moo-ui.css", import.meta.url), "utf8");
  const visit = (record) => {
    for (const [key, value] of Object.entries(record)) {
      if (Array.isArray(value)) for (const token of value) assert.ok(css.includes(`.${token}`), token);
      else if (value && typeof value === "object") visit(value);
    }
  };
  visit(resolveParts());
  const tokens = layoutSchema.shape.parts.unwrap().shape.content.unwrap().shape.utilities.unwrap().element.options;
  for (const token of tokens) assert.ok(css.includes(`.${token}`), token);
});
