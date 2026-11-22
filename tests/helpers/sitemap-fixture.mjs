// An ibeb-like host site for the HTML sitemap: ten top-level pages, one
// single-page segment, and a "magazin" segment with an index page and 130
// long-titled articles. Used by tests/sitemap-page-build.test.mjs and, with
// an outDir, for a visual check served from apps/demo/dist.
import { spawnSync } from "node:child_process";
import { cp, mkdir, readdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const sdk = fileURLToPath(new URL("../../", import.meta.url));
export const fixtureSite = "https://example.test";

async function write(root, name, text) {
  const path = join(root, name);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, text);
}

const topTitles = [
  "Über uns",
  "Kontakt",
  "Angebote für Familien",
  "Kitas und Familienzentren",
  "Beratung",
  "Spenden",
  "Stellenangebote",
  "Impressum",
  "Datenschutzerklärung",
];
const slugOf = (text) =>
  text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");

/** Write the fixture site into root, linking the SDK and its dependencies. */
export async function createSitemapFixture(root, { base = "/", outDir } = {}) {
  await mkdir(join(root, "node_modules/@wpmoo"), { recursive: true });
  for (const name of await readdir(join(sdk, "node_modules"))) {
    if (name === "@wpmoo") continue;
    await symlink(join(sdk, "node_modules", name), join(root, "node_modules", name));
  }
  await symlink(join(sdk, "node_modules/@wpmoo/ui"), join(root, "node_modules/@wpmoo/ui"));
  await cp(join(sdk, "packages/astro"), join(root, "node_modules/@wpmoo/astro"), {
    recursive: true,
    filter: (path) => !path.includes("/node_modules"),
  });
  await write(root, "package.json", JSON.stringify({ private: true, type: "module" }));
  await write(
    root,
    "astro.config.mjs",
    `import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
export default defineConfig({ site: "${fixtureSite}", base: ${JSON.stringify(base)}, trailingSlash: "always", cacheDir: "./.astro-cache",${outDir ? ` outDir: ${JSON.stringify(outDir)},` : ""}
  integrations: [moo({ site: { brand: "Fixture e.V.", organization: { name: "Fixture e.V." }, defaults: { lang: "de" } }, plugins: [page()] })] });`,
  );
  await write(
    root,
    "src/content.config.ts",
    `import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { sourceEntryId } from "@wpmoo/astro/content";
import { pageSchema } from "@wpmoo/astro/plugins/page/content";
export const collections = { page: defineCollection({ loader: glob({ base: new URL("./content/page/", import.meta.url), pattern: "**/*.md", generateId: sourceEntryId }), schema: pageSchema }) };`,
  );
  const entry = (file, title, slug, extra = "") =>
    write(root, `src/content/page/${file}.md`, `---\ntitle: ${JSON.stringify(title)}\nslug: ${JSON.stringify(slug)}\nstatus: publish\n${extra}---\nText.`);
  await entry("index", "Startseite", "index", 'description: "Bildung, Beratung und Begegnung in Berlin."\n');
  for (const title of topTitles) await entry(slugOf(title), title, slugOf(title), `description: ${JSON.stringify(`${title}: kurze Beschreibung der Seite.`)}\n`);
  // A segment with one page joins the top-level group.
  await entry("team/vorstand", "Vorstand", "team/vorstand");
  await entry("magazin/index", "Magazin", "magazin", 'description: "Beiträge und Ausgaben des Magazins."\n');
  for (let index = 1; index <= 130; index += 1) {
    const number = String(index).padStart(3, "0");
    const title =
      index === 7
        ? "Donaudampfschifffahrtsgesellschaftskapitänsmützenabzeichenherstellungsbetriebsbesichtigung im Familienzentrum"
        : `Ausgabe ${Math.ceil(index / 20)}, Beitrag ${number}: Wie Kitas, Familienzentren und Schulen in Berlin-Spandau gemeinsam Übergänge für Kinder und Eltern gestalten`;
    const date = index % 3 === 0 ? `updated_at: "2026-${String((index % 12) + 1).padStart(2, "0")}-15T10:00:00+01:00"\n` : "";
    const description = index % 2 === 0 ? `description: ${JSON.stringify(`Ein Bericht aus der Praxis, Teil ${number}, mit Stimmen von Fachkräften, Eltern und Kindern.`)}\n` : "";
    await entry(`magazin/beitrag-${number}`, title, `magazin/beitrag-${number}`, date + description);
  }
}

export function buildFixture(root) {
  return spawnSync(join(sdk, "node_modules/.bin/astro"), ["build"], { cwd: root, encoding: "utf8" });
}
