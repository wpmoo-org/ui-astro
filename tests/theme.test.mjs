import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { defineSite } from "../packages/astro/src/config/index.js";
import moo from "../packages/astro/src/integration/index.js";
import {
  contrastRatio, hexToRgb, linkHoverColor, mixRgb, primaryStateColors, readableForeground,
  resolveTheme, ringColor, themeCss,
} from "../packages/astro/src/theme/index.js";

const ibeb = { colors: { primary: "#016db7", inverseSurface: "#0b2545" } };
const ratio = (a, b) => contrastRatio(hexToRgb(a), hexToRgb(b));

test("primaryStateColors reproduces the eight documented Core vectors", () => {
  const vectors = [
    ["#171717", "#ffffff", "#454545", "#585858"],
    ["#016db7", "#ffffff", "#0164a8", "#015c9a"],
    ["#2563eb", "#ffffff", "#225bd8", "#1f53c5"],
    ["#a8d1f0", "#0a0a0a", "#b9daf3", "#c0def4"],
    ["#4a90d9", "#ffffff", "#3e79b6", "#386da5"],
    ["#7aa7d9", "#ffffff", "#537294", "#496482"],
    ["#767676", "#777777", "#050505", "#050505"],
    ["#ffffff", "#ffffff", "#ffffff", "#ffffff"],
  ];
  for (const [primary, label, hover, active] of vectors)
    assert.deepEqual(primaryStateColors(primary, label), { hover, active }, primary);
  assert.equal(ratio("#0164a8", "#ffffff").toFixed(2), "6.20");
});

test("foregrounds default by contrast", () => {
  assert.equal(readableForeground("#016db7"), "#ffffff");
  assert.equal(readableForeground("#a8d1f0"), "#0a0a0a");
  assert.equal(readableForeground("#0b2545"), "#ffffff");
});

const lightSurfaces = ["#ffffff", "#fafafa", "#f4f4f5"];
const darkSurfaces = ["#0a0a0a", "#1c1c1f", "#19191a", "#202024", "#27272a"];
const rendered = (ring, surface) => ratio(`#${mixRgb(hexToRgb(surface), hexToRgb(ring), 50).map((c) => c.toString(16).padStart(2, "0")).join("")}`, surface);

test("ring is the smallest anchor mix that clears 3:1 on every surface of the mode", () => {
  for (const [primary, surfaces] of [["#016db7", lightSurfaces], ["#016db7", darkSurfaces], ["#757575", darkSurfaces], ["#757575", lightSurfaces]]) {
    const result = ringColor(primary, surfaces);
    assert.equal(result.ok, true);
    for (const surface of surfaces) assert.ok(rendered(result.ring, surface) >= 3, `${primary} ${surface}`);
  }
  assert.equal(ringColor("#016db7", lightSurfaces).ring, "#002742");
  assert.equal(ringColor("#016db7", darkSurfaces).ring, "#8fbfdf");
  // Reviewer counterexample: a ring fitted to #0a0a0a alone fails on the muted surface.
  const single = ringColor("#757575", "#0a0a0a");
  assert.ok(rendered(single.ring, "#27272a") < 3);
  const all = ringColor("#757575", darkSurfaces);
  assert.ok(rendered(all.ring, "#27272a") >= 3);
  assert.notEqual(all.ring, single.ring);
});

test("link colour must clear 4.5:1 on every light text surface", () => {
  // #757575 passes on white (4.60) but not on #f4f4f5 (4.19).
  assert.ok(ratio("#757575", "#ffffff") >= 4.5);
  assert.throws(() => resolveTheme({ colors: { primary: "#757575", primaryForeground: "#000000" } }),
    /site\.theme: link colour primary #757575 on surface #f4f4f5 is 4\.19:1, needs 4\.5:1/);
});

test("link hover is derived as text, separate from the button hover fill", () => {
  const resolved = resolveTheme({ colors: { primary: "#6b6b6b" } });
  for (const surface of lightSurfaces) assert.ok(ratio(resolved.colors.linkHover, surface) >= 4.5, surface);
  assert.equal(linkHoverColor("#016db7"), "#0164a8");
  // The button hover fill of #757575 with a black label (#919191) is only 3.15:1 as text.
  assert.ok(ratio(primaryStateColors("#757575", "#000000").hover, "#ffffff") < 3.2);
  assert.ok(ratio(linkHoverColor("#757575"), "#ffffff") >= 4.5);
  assert.equal(themeCss(resolved).includes(`--bs-link-hover-color: ${resolved.colors.linkHover};`), true);
});

test("resolveTheme derives the ibeb example", () => {
  const resolved = resolveTheme({ colors: { primary: "#016db7", inverseSurface: "#0b2545" } });
  assert.equal(resolved.colors.primaryForeground, "#ffffff");
  assert.equal(resolved.colors.hover, "#0164a8");
  assert.equal(resolved.colors.inverse.foreground, "#ffffff");
  assert.equal(resolved.radius, "default");
});

test("validation names the pair and the measured ratio", () => {
  assert.throws(() => resolveTheme({ colors: { primary: "#aabbcc" } }),
    /site\.theme: link colour primary #aabbcc on surface #f4f4f5 is 1\.79:1, needs 4\.5:1/);
  assert.throws(() => resolveTheme({ colors: { primary: "#016db7", primaryForeground: "#222222" } }),
    /primary #016db7 with primaryForeground #222222 is \d\.\d\d:1, needs 4\.5:1/);
  assert.throws(() => resolveTheme({ colors: { primary: "#016db7", inverseSurface: "#0b2545", inverseForeground: "#334455" } }),
    /inverseForeground #334455 on inverseSurface #0b2545 is \d\.\d\d:1, needs 4\.5:1/);
  assert.throws(() => resolveTheme({ colors: { primary: "#016db7", inverseSurface: "#808080", inverseForeground: "#ffffff" } }),
    /inverseForeground #ffffff on inverseSurface #808080/);
  assert.throws(() => resolveTheme({ colors: { primary: "#016db7", inverseForeground: "#ffffff" } }), /requires colors\.inverseSurface/);
});

test("inverseSurface must be a dark scope", () => {
  assert.throws(() => resolveTheme({ colors: { primary: "#016db7", inverseSurface: "#ffffff" } }),
    /inverseSurface #ffffff must be dark; against #ffffff it is 1\.00:1, needs 4\.5:1/);
  assert.throws(() => resolveTheme({ colors: { primary: "#016db7", inverseSurface: "#0b2545", inverseForeground: "#334455" } }),
    /inverseForeground #334455 on dark muted surface #27272a/);
});

test("navbar link rule is checked at 65% alpha when the base pairs pass", () => {
  // inverseForeground #8e8e8e reaches 4.5:1 on #0a0a14 and on #27272a; only the 65% blend (#606063) fails.
  assert.ok(ratio("#8e8e8e", "#0a0a14") >= 4.5);
  assert.ok(ratio("#8e8e8e", "#27272a") >= 4.5);
  assert.throws(() => resolveTheme({ colors: { primary: "#016db7", inverseSurface: "#0a0a14", inverseForeground: "#8e8e8e" } }),
    (error) => /navbar link #606063 .* on inverseSurface is 3\.14:1, needs 4\.5:1/.test(error.message) && !/inverseForeground #8e8e8e on/.test(error.message));
});

test("defineSite validates theme input and freezes the result", () => {
  const site = defineSite({ theme: { ...ibeb, fonts: { body: '"Inter", sans-serif' }, radius: "small", typography: "website" } });
  assert.equal(site.theme.colors.primary, "#016db7");
  assert.equal(Object.isFrozen(site.theme), true);
  assert.equal(defineSite({}).theme, undefined);
  assert.equal(defineSite({ theme: { colors: { primary: "#016DB7" } } }).theme.colors.primary, "#016db7");
  for (const bad of [
    { colors: { primary: "blue" } },
    { colors: { primary: "#016db7", accent: "#ff0000" } },
    { fonts: { body: "x; color: red" } },
    { fonts: { heading: "a } b {" } },
    { radius: "huge" },
    { typography: "print" },
    { extra: true },
  ]) assert.throws(() => defineSite({ theme: bad }), /theme/, JSON.stringify(bad));
  assert.throws(() => defineSite({ theme: { colors: { primary: "#aabbcc" } } }), /site\.theme:.*needs 4\.5:1/);
});

test("emitted CSS for the ibeb example", () => {
  const css = themeCss(resolveTheme({ ...ibeb }));
  assert.equal(css, `.moo-ui[data-bs-theme] {
  --moo-primary: #016db7;
  --bs-primary: #016db7;
  --bs-primary-rgb: 1, 109, 183;
  --moo-primary-foreground: #ffffff;
  --moo-primary-foreground-dark: #ffffff;
  --moo-primary-hover: #0164a8;
  --moo-primary-active: #015c9a;
}
.moo-ui[data-bs-theme="light"] {
  --bs-link-color: #016db7;
  --bs-link-color-rgb: 1, 109, 183;
  --bs-link-hover-color: #0164a8;
  --bs-link-hover-color-rgb: 1, 100, 168;
  --moo-ring: #002742;
}
.moo-ui[data-bs-theme="dark"] {
  --moo-ring: #8fbfdf;
}
.moo-ui[data-bs-theme][data-header-surface="dark"] {
  --moo-surface: #0b2545;
  --bs-body-bg: #0b2545;
  --bs-body-bg-rgb: 11, 37, 69;
  --bs-tertiary-bg: #0b2545;
  --bs-tertiary-bg-rgb: 11, 37, 69;
  --moo-foreground: #ffffff;
  --bs-body-color: #ffffff;
  --bs-body-color-rgb: 255, 255, 255;
  --bs-emphasis-color: #ffffff;
  --bs-emphasis-color-rgb: 255, 255, 255;
  --bs-link-color: #ffffff;
  --bs-link-color-rgb: 255, 255, 255;
  --bs-link-hover-color: #ffffff;
  --bs-link-hover-color-rgb: 255, 255, 255;
  --moo-ring: #8fbfdf;
}
`);
});

test("fonts and radius alone emit one shared rule; nothing emits nothing", () => {
  const css = themeCss(resolveTheme({ fonts: { body: "Inter, sans-serif", heading: "Georgia, serif" }, radius: "large" }));
  assert.match(css, /--bs-body-font-family: Inter, sans-serif;/);
  assert.match(css, /--moo-heading-font-family: Georgia, serif;/);
  assert.match(css, /--bs-border-radius-xxl: 1\.5rem;/);
  assert.equal(css.includes("data-header-surface"), false);
  assert.equal(css.includes("--moo-primary"), false);
  assert.equal(themeCss(null), "");
  assert.equal(themeCss(resolveTheme({ radius: "default" })), "");
  assert.equal(themeCss(resolveTheme({})), "");
});

const themeFiles = {
  css: fileURLToPath(new URL("../packages/astro/src/theme/site-theme.css", import.meta.url)),
  active: fileURLToPath(new URL("../packages/astro/src/theme/active.js", import.meta.url)),
};
function themePlugin(site) {
  const integration = moo({ plugins: [], ...(site ? { site } : {}) });
  const updates = [];
  integration.hooks["astro:config:setup"]({
    config: {
      root: new URL("./fixtures/ui-only/", import.meta.url),
      srcDir: new URL("./fixtures/ui-only/src/", import.meta.url),
      cacheDir: new URL("./fixtures/ui-only/.astro/", import.meta.url),
      vite: {}, base: "/", trailingSlash: "ignore", output: "static", prerenderConflictBehavior: "error", integrations: [integration],
    },
    command: "build", injectRoute() {}, updateConfig: (value) => updates.push(value), addMiddleware() {},
  });
  return updates.flatMap((value) => value.vite?.plugins ?? []).find((plugin) => plugin.name === "wpmoo-astro-theme");
}
const realpath = (path) => path;

test("Layout imports real package files and no virtual specifier", () => {
  const layout = readFileSync(new URL("../packages/astro/src/layouts/Layout.astro", import.meta.url), "utf8");
  assert.equal(layout.includes("virtual:"), false);
  assert.match(layout, /import "\.\.\/styles\.css";\nimport "\.\.\/theme\/site-theme\.css";\nimport \{ typography \} from "\.\.\/theme\/active\.js";/);
  assert.equal(readFileSync(themeFiles.css, "utf8"), "");
  assert.match(readFileSync(themeFiles.active, "utf8"), /export const typography = "app";/);
  const manifest = JSON.parse(readFileSync(new URL("../packages/astro/package.json", import.meta.url), "utf8"));
  for (const file of ["src/theme/site-theme.css", "src/theme/active.js"]) assert.ok(manifest.files.includes(file), file);
});

test("without a theme the plugin leaves the files empty and typography app", () => {
  const plugin = themePlugin();
  assert.ok(!plugin.load(themeFiles.css));
  assert.equal(plugin.load(themeFiles.active), 'export const typography = "app";');
  assert.equal(plugin.load("/elsewhere/other.css"), null);
});

test("with a theme the plugin rewrites the stylesheet and typography", () => {
  const plugin = themePlugin({ theme: { colors: { primary: "#016db7" }, typography: "website" } });
  assert.match(plugin.load(`${themeFiles.css}?used`), /--moo-primary: #016db7;/);
  assert.equal(plugin.load(themeFiles.active), 'export const typography = "website";');
  void realpath;
});
