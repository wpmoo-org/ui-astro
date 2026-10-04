import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export const digest = (bytes, algorithm = "sha256", encoding = "hex") =>
  createHash(algorithm).update(bytes).digest(encoding);
export const readJson = async (path) =>
  JSON.parse(await readFile(path, "utf8"));

export async function treeFiles(root) {
  const result = [];
  async function visit(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const name = `${prefix}${entry.name}`;
      assert.equal(entry.isSymbolicLink(), false, `source symlink: ${name}`);
      if (entry.isDirectory())
        await visit(join(directory, entry.name), `${name}/`);
      else {
        assert.ok(entry.isFile(), `unsupported file: ${name}`);
        result.push(name);
      }
    }
  }
  await visit(root);
  return result.sort();
}
export async function fileHashes(root, names) {
  return Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [
        name,
        digest(await readFile(join(root, name))),
      ]),
    ),
  );
}
export async function assertPilotArchives(root, artifacts) {
  for (const [name, artifact] of Object.entries(artifacts)) {
    assert.match(
      artifact.filename,
      /^[a-zA-Z0-9._-]+\.tgz$/,
      "archive filename must be local",
    );
    const bytes = await readFile(join(root, artifact.filename));
    assert.equal(digest(bytes), artifact.sha256, `archive changed: ${name}`);
    assert.equal(
      `sha512-${digest(bytes, "sha512", "base64")}`,
      artifact.integrity,
      `archive integrity changed: ${name}`,
    );
  }
}
export function validatePilotLock(manifest, lock, artifacts) {
  assert.equal(lock.lockfileVersion, 3, "real v3 lock required");
  assert.equal(
    manifest.workspaces,
    undefined,
    "independent project cannot use workspaces",
  );
  for (const [path, record] of Object.entries(lock.packages)) {
    assert.ok(!record.link, `workspace link forbidden: ${path}`);
    if (path)
      assert.ok(
        path.startsWith("node_modules/"),
        `source resolution forbidden: ${path}`,
      );
    if (record.resolved?.startsWith("file:")) {
      assert.ok(
        Object.keys(artifacts).some((name) => path === `node_modules/${name}`),
        `foreign file dependency: ${path}`,
      );
    }
  }
  for (const [name, artifact] of Object.entries(artifacts)) {
    const expected = `file:../${artifact.filename}`;
    const record = lock.packages[`node_modules/${name}`];
    assert.equal(
      manifest.dependencies[name],
      expected,
      `exact archive required: ${name}`,
    );
    assert.equal(lock.packages[""].dependencies[name], expected);
    assert.equal(record.resolved, expected);
    assert.equal(record.version, artifact.manifest.version);
    assert.equal(record.integrity, artifact.integrity);
  }
  for (const [name, version] of Object.entries({
    astro: "7.3.3",
    "@wpmoo/ui": "1.0.0",
    bootstrap: "5.3.8",
    "@astrojs/mdx": "8.0.2",
    "@astrojs/check": "0.9.10",
    typescript: "6.0.3",
  })) {
    assert.equal(
      lock.packages[`node_modules/${name}`]?.version,
      version,
      `pin changed: ${name}`,
    );
  }
}

export function pilotRoutes(profile) {
  const main = profile.mainLanguage;
  const category = {
    category: { en: "category", de: "kategorie" },
    short: { en: "c", de: "k" },
    root: { en: "", de: "" },
  }[profile.categoryProfile];
  assert.ok(["en", "de"].includes(main) && category, "invalid profile");
  const paths = {
    en: {
      home: "",
      about: "about",
      services: "services",
      contact: "contact",
      enhanced: "enhanced",
      announcement: "blog/announcement",
      update: "blog/project-update",
      archive: "blog",
      category: [category.en, "guides"].filter(Boolean).join("/"),
      tag: "tag/astro",
      sector: "foundation",
      native: "native-action",
      error: "404",
    },
    de: {
      home: "",
      about: "ueber-uns",
      services: "leistungen",
      contact: "kontakt",
      enhanced: "erweitert",
      announcement: "beitraege/ankuendigung",
      update: "beitraege/projektupdate",
      archive: "beitraege",
      category: [category.de, "anleitungen"].filter(Boolean).join("/"),
      tag: "schlagwort/astro",
      sector: "grundlagen",
      native: "native-action",
      error: "404",
    },
  };
  const result = {};
  for (const locale of ["en", "de"]) {
    for (const [key, path] of Object.entries(paths[locale])) {
      const href = `/${[locale === main ? "" : locale, path].filter(Boolean).join("/")}`;
      const file =
        href === "/"
          ? "index.html"
          : href === "/404"
            ? "404.html"
            : `${href.slice(1)}/index.html`;
      result[file] = { key, locale, href };
    }
  }
  return result;
}
const decode = (value) =>
  value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
function attrs(source) {
  return Object.fromEntries(
    [...source.matchAll(/([^\s=]+)(?:="([^"]*)"|='([^']*)')?/gu)].map(
      (match) => [match[1], decode(match[2] ?? match[3] ?? "")],
    ),
  );
}
export function inspectPilotHtml(html, route, routes, inset) {
  const tags = (name) =>
    [...html.matchAll(new RegExp(`<${name}\\b([^>]*)>`, "gu"))].map((match) =>
      attrs(match[1]),
    );
  const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gu)].map(
    (match) => ({
      ...attrs(match[1]),
      body: match[2],
      text: decode(match[2].replace(/<[^>]*>/gu, "")).trim(),
    }),
  );
  assert.equal(tags("html").length, 1, "one document");
  assert.equal(tags("html")[0].lang, route.locale, "selected language");
  assert.equal(
    tags("main").filter((tag) => tag.id === "main-content").length,
    1,
    "one main",
  );
  assert.equal(
    tags("div").filter((tag) => tag["data-moo-document-owner"] === "true")
      .length,
    1,
    "one document owner",
  );
  assert.equal(
    tags("script").filter((tag) => tag.type === "module" && tag.src).length,
    1,
    "one runtime",
  );
  const rail = tags("div").filter((tag) =>
    Object.hasOwn(tag, "data-page-container"),
  );
  assert.equal(rail.length, 1, "one content inset owner");
  assert.deepEqual(
    rail[0].class.split(/\s/u).filter((name) => /^py-/u.test(name)),
    [inset],
    "project inset replacement",
  );
  assert.equal(
    tags("div").filter((tag) => tag["data-slot"] === "sidebar-wrapper").length,
    1,
    "sidebar inherited",
  );
  const urls = new Map(
    Object.values(routes).map((value) => [value.href, value]),
  );
  for (const anchor of anchors) {
    if (!anchor.href || anchor.href.startsWith("#")) continue;
    assert.ok(
      urls.has(anchor.href),
      `link has no emitted target: ${anchor.href}`,
    );
    if (anchor.class?.split(" ").includes("sidebar-menu-button"))
      assert.equal(
        urls.get(anchor.href).locale,
        route.locale,
        "sidebar preserves language",
      );
    if (anchor.class?.split(" ").includes("btn"))
      assert.ok(
        !/<p\b/iu.test(anchor.body),
        "Action must not contain a paragraph",
      );
  }
  const metadata = tags("link");
  const canonical = metadata.filter((tag) => tag.rel === "canonical");
  const alternates = metadata
    .filter((tag) => tag.rel === "alternate")
    .map((tag) => ({ locale: tag.hreflang, href: tag.href }))
    .sort((a, b) => a.locale.localeCompare(b.locale));
  const pair = Object.values(routes).filter((value) => value.key === route.key);
  if (route.key === "error") {
    assert.equal(canonical.length, 0, "error canonical omitted");
    assert.deepEqual(alternates, [], "error alternates omitted");
    const title =
      route.locale === "de" ? "Diese Seite fehlt" : "Page not found";
    assert.ok(html.includes(title), "resolved error title");
    assert.ok(
      html.includes(
        route.locale === "de"
          ? "Die angeforderte Seite wurde nicht gefunden."
          : "The page you requested could not be found.",
      ),
      "inherited error description",
    );
    const home = Object.values(routes).find(
      (value) => value.key === "home" && value.locale === route.locale,
    ).href;
    assert.ok(
      anchors.some(
        (a) =>
          a.href === home &&
          a.text ===
            (route.locale === "de" ? "Zur Startseite" : "Back to home"),
      ),
      "localized error recovery",
    );
  } else {
    assert.equal(canonical.length, 1, "one canonical");
    assert.equal(
      canonical[0].href,
      `https://pilot.example.test${route.href}`,
      "canonical identity",
    );
    assert.deepEqual(
      alternates,
      pair
        .map((value) => ({
          locale: value.locale,
          href: `https://pilot.example.test${value.href}`,
        }))
        .sort((a, b) => a.locale.localeCompare(b.locale)),
      "translated alternates",
    );
  }
  if (["enhanced", "native"].includes(route.key)) {
    const label =
      route.locale === "de" ? "Native Seite öffnen" : "Explore the native page";
    const target = Object.values(routes).find(
      (value) =>
        value.key === (route.key === "enhanced" ? "native" : "home") &&
        value.locale === route.locale,
    ).href;
    const controls = anchors.filter(
      (a) => a.text === label && a.class?.split(" ").includes("btn"),
    );
    assert.equal(controls.length, 1, "one literal Action label");
    assert.equal(controls[0].href, target, "locale Action target");
  }
  const dates = tags("time").map((tag) => tag.datetime);
  if (
    ["announcement", "update", "archive", "category", "tag", "sector"].includes(
      route.key,
    )
  )
    assert.ok(dates.length > 0, "published ISO date retained");
  for (const date of dates)
    assert.equal(
      date,
      "2026-10-01T10:00:00.000Z",
      "display language must preserve ISO time",
    );
  return {
    href: route.href,
    locale: route.locale,
    canonical: canonical[0]?.href ?? null,
    alternates,
    links: anchors
      .filter((a) => a.href)
      .map((a) => a.href)
      .sort(),
    dates,
    inset,
  };
}
export async function collectPilotOutput(directory, profile, inset = "py-2") {
  const root = join(directory, "dist");
  const files = await treeFiles(root);
  const routes = pilotRoutes(profile);
  assert.deepEqual(
    files.filter((name) => name.endsWith(".html")),
    Object.keys(routes).sort(),
    "complete canonical route inventory",
  );
  const observations = {};
  for (const [name, route] of Object.entries(routes))
    observations[name] = inspectPilotHtml(
      await readFile(join(root, name), "utf8"),
      route,
      routes,
      inset,
    );
  return {
    files: await fileHashes(root, files),
    html: Object.fromEntries(
      await Promise.all(
        Object.keys(routes).map(async (name) => [
          name,
          digest(await readFile(join(root, name))),
        ]),
      ),
    ),
    observations,
  };
}
