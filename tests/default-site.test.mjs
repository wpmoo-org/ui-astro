import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cp,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const sdk = fileURLToPath(new URL("../", import.meta.url));
const anchorAttributes = (html) =>
  [...html.matchAll(/<a\s([^>]+)>/gu)].map((match) =>
    Object.fromEntries(
      [...match[1].matchAll(/([\w-]+)="([^"]*)"/gu)].map((attribute) => [
        attribute[1],
        attribute[2],
      ]),
    ),
  );
async function buildDefaultSite(
  controls,
  {
    homes = ["en", "de"],
    hierarchical = false,
    monolingual = false,
    documentLanguage,
  } = {},
) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), "moo-default-site-")),
  );
  const write = async (name, text) => {
    const path = join(root, name);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, text);
  };
  try {
    await mkdir(join(root, "node_modules/@wpmoo"), { recursive: true });
    for (const name of await readdir(join(sdk, "node_modules"))) {
      if (name === "@wpmoo") continue;
      await symlink(
        join(sdk, "node_modules", name),
        join(root, "node_modules", name),
      );
    }
    await symlink(
      join(sdk, "node_modules/@wpmoo/ui"),
      join(root, "node_modules/@wpmoo/ui"),
    );
    await cp(
      join(sdk, "packages/astro"),
      join(root, "node_modules/@wpmoo/astro"),
      { recursive: true, filter: (path) => !path.includes("/node_modules") },
    );
    await write(
      "package.json",
      JSON.stringify({ private: true, type: "module" }),
    );
    await write(
      "astro.config.mjs",
      `
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import moo from "@wpmoo/astro";
import { defineSite } from "@wpmoo/astro/config";
import { page } from "@wpmoo/astro/plugins/page";
import { post } from "@wpmoo/astro/plugins/post";
import { defineTaxonomy } from "@wpmoo/astro/taxonomies";
const audience = defineTaxonomy({ id: "audience", label: "Audience", hierarchical: ${hierarchical}, source: new URL("./src/audience.json", import.meta.url), archive: { basePath: "/audience" }, ${monolingual ? "" : 'locales: { de: { label: "Zielgruppen", basePath: "/zielgruppe" } }'} });
export default defineConfig({ site: "https://example.test", cacheDir: "./.astro-cache", ${monolingual ? "" : 'i18n: { locales: ["en", "de"], defaultLocale: "en", routing: { prefixDefaultLocale: false } },'} integrations: [mdx(), moo({
site: defineSite({ brand: "Fixture", defaults: { sidebar: {} }, presentation: { navigation: "grouped", themeToggle: ${controls}, languageSwitcher: ${controls ? "{}" : "false"} }, links: { home: ${monolingual ? '{ en: "/" }' : '"/"'} } }),
plugins: [page({ source: new URL("./src/content/page/", import.meta.url), formats: ["md", "mdx"], taxonomies: ["audience"] }), post({ source: new URL("./src/content/post/", import.meta.url), taxonomies: ["audience"] })], taxonomies: [audience]
})] });`,
    );
    await write(
      "src/content.config.ts",
      `
import { defineCollection, reference } from "astro:content";
import { glob, file } from "astro/loaders";
import { z } from "astro/zod";
import { sourceEntryId } from "@wpmoo/astro/content";
import { pageSchema } from "@wpmoo/astro/plugins/page/content";
import { postSchema } from "@wpmoo/astro/plugins/post/content";
import { termSchema } from "@wpmoo/astro/taxonomies/content";
const relationships = { taxonomies: z.object({ audience: z.array(reference("audience")).default([]) }).strict().optional() };
export const collections = {
page: defineCollection({ loader: glob({ base: new URL("./content/page/", import.meta.url), pattern: "**/*.{md,mdx}", generateId: sourceEntryId, retainBody: true }), schema: pageSchema.extend(relationships) }),
post: defineCollection({ loader: glob({ base: new URL("./content/post/", import.meta.url), pattern: "**/*.md", generateId: sourceEntryId, retainBody: true }), schema: postSchema.extend(relationships) }),
audience: defineCollection({ loader: file(new URL("./audience.json", import.meta.url).pathname), schema: termSchema })
};`,
    );
    await write(
      "src/audience.json",
      JSON.stringify([
        {
          id: "students",
          name: "Students",
          slug: "students",
          ...(monolingual
            ? {}
            : {
                locales: { de: { name: "Studierende", slug: "studierende" } },
              }),
          ...(hierarchical ? { parent: "learners" } : {}),
        },
        ...(hierarchical
          ? [
              {
                id: "learners",
                name: "Learners",
                slug: "learners",
                locales: { de: { name: "Lernende", slug: "lernende" } },
              },
            ]
          : []),
      ]),
    );
    for (const locale of monolingual ? ["en"] : ["en", "de"]) {
      if (homes.includes(locale))
        await write(
          `src/content/page/${locale}/index.md`,
          `---\ntitle: ${locale === "en" ? "Welcome" : "Willkommen"}\nslug: index\nstatus: publish\n${monolingual ? "" : `locale: ${locale}\ntranslationKey: home\n`}---\nHome body.`,
        );
      await write(
        `src/content/page/${locale}/contact.md`,
        `---\ntitle: Contact\nslug: contact\nstatus: publish\n${monolingual ? "" : `locale: ${locale}\ntranslationKey: contact\n`}options:\n  sidebar: null\n---\nContact body.`,
      );
    }
    await write(
      "src/content/page/en/enhanced.mdx",
      `---\ntitle: Enhanced\nslug: enhanced\nstatus: publish\n${monolingual ? "" : "locale: en\ntranslationKey: enhanced\n"}${documentLanguage ? `options:\n  lang: ${documentLanguage}\n` : ""}taxonomies:\n  audience: [students]\n---\nimport Button from "@wpmoo/astro/components/Button.astro";\n\n<Button element="a" href={props.links.home} label="Prepared home" />\n`,
    );
    await write(
      "src/content/post/en/update.md",
      `---\ntitle: Update\nslug: update\nstatus: publish\n${monolingual ? "" : "locale: en\ntranslationKey: update\n"}${documentLanguage ? `options:\n  lang: ${documentLanguage}\n` : ""}published_at: "2026-10-01T00:00:00Z"\ntaxonomies:\n  audience: [students]\n---\nPost body.`,
    );
    const run = spawnSync(
      process.execPath,
      [join(sdk, "node_modules/astro/bin/astro.mjs"), "build", "--root", root],
      { cwd: root, encoding: "utf8", timeout: 60000 },
    );
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const outputs = {};
    for (const name of [
      ...(homes.includes("en") ? ["index.html"] : []),
      "enhanced/index.html",
      "contact/index.html",
      ...(monolingual
        ? []
        : [
            "de/404/index.html",
            "de/contact/index.html",
            "de/zielgruppe/studierende/index.html",
          ]),
      "posts/update/index.html",
      ...(hierarchical
        ? [
            "audience/students/index.html",
            "de/zielgruppe/studierende/index.html",
          ]
        : []),
    ])
      outputs[name] = await readFile(join(root, "dist", name), "utf8");
    await assert.rejects(readFile(join(root, "dist/de/enhanced/index.html")), {
      code: "ENOENT",
    });
    return outputs;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("default_site_renders_optional_controls_and_missing_translations", async () => {
  const html = await buildDefaultSite(true);
  assert.match(html["index.html"], /data-moo-theme-toggle/);
  assert.match(html["index.html"], /aria-label="Language"/);
  assert.ok(
    html["index.html"].indexOf("data-moo-theme-toggle") <
      html["index.html"].indexOf('aria-label="Language"'),
  );
  assert.match(
    html["enhanced/index.html"],
    /href="https:\/\/example.test\/enhanced"/,
  );
  assert.doesNotMatch(html["enhanced/index.html"], /hreflang="de"/);
  assert.doesNotMatch(html["enhanced/index.html"], /aria-label="Language"/);
  assert.match(
    html["enhanced/index.html"],
    /href="\/"[^>]*>Prepared home<\/a>/,
  );
  for (const name of ["enhanced/index.html", "posts/update/index.html"]) {
    assert.deepEqual(
      anchorAttributes(html[name])
        .filter((link) => link.rel === "tag")
        .map((link) => link.href),
      ["/audience/students"],
    );
  }
});

test("default_site_keeps_no_sidebar_and_error_recovery_in_one_shell", async () => {
  const html = await buildDefaultSite(false);
  for (const output of Object.values(html)) {
    assert.equal(
      [...output.matchAll(/data-moo-document-owner="true"/gu)].length,
      1,
    );
    assert.equal([...output.matchAll(/data-page-container/gu)].length, 1);
    assert.doesNotMatch(
      output,
      /data-moo-theme-toggle|aria-label="Language"|aria-label="Sprache"/,
    );
  }
  assert.doesNotMatch(html["contact/index.html"], /data-slot="sidebar"/);
  assert.doesNotMatch(html["contact/index.html"], /rel="tag"/);
  assert.match(html["de/404/index.html"], /href="\/de"/);
  assert.doesNotMatch(
    html["de/404/index.html"],
    /rel="canonical"|application\/ld\+json/,
  );
});

test("default_site_uses_available_navigation_when_home_is_unpublished", async () => {
  const html = await buildDefaultSite(false, { homes: [] });
  for (const [name, expected] of [
    ["enhanced/index.html", "/contact"],
    ["de/zielgruppe/studierende/index.html", "/de/contact"],
  ]) {
    const header = html[name].match(/<header\b[\s\S]*?<\/header>/u)?.[0] ?? "";
    const footer = html[name].match(/<footer\b[\s\S]*?<\/footer>/u)?.[0] ?? "";
    assert.ok(
      anchorAttributes(header).some((link) => link.href === expected),
      header,
    );
    assert.ok(
      anchorAttributes(footer).some((link) => link.href === expected),
      footer,
    );
    assert.ok(
      !anchorAttributes(header).some(
        (link) => link.href === (expected.startsWith("/de/") ? "/de" : "/"),
      ),
      header,
    );
  }
});

test("default_taxonomy_shell_preserves_localized_ancestor_breadcrumbs", async () => {
  const html = await buildDefaultSite(false, { hierarchical: true });
  for (const [name, parent, label] of [
    ["audience/students/index.html", "/audience/learners", "Learners"],
    [
      "de/zielgruppe/studierende/index.html",
      "/de/zielgruppe/lernende",
      "Lernende",
    ],
  ]) {
    const header = html[name].match(/<header\b[\s\S]*?<\/header>/u)?.[0] ?? "";
    assert.ok(
      anchorAttributes(header).some((link) => link.href === parent),
      header,
    );
    assert.ok(header.includes(label), header);
  }
});

test("monolingual_entry_document_language_does_not_change_named_link_locale", async () => {
  const html = await buildDefaultSite(false, {
    monolingual: true,
    documentLanguage: "de",
  });
  for (const name of ["enhanced/index.html", "posts/update/index.html"])
    assert.match(html[name], /<html[^>]*lang="de"/u);
  assert.match(
    html["enhanced/index.html"],
    /href="\/"[^>]*>Prepared home<\/a>/u,
  );
});
