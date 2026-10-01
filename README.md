# Moo UI Astro adapter

`@wpmoo/astro` composes Astro pages from the published `@wpmoo/ui@1.0.0-rc.9` CSS, state script, and ESM components. Its package has 45 public component wrappers, one Layout, four shared includes, three generic views, pure configuration and plugin-descriptor entrypoints, Page content/schema/query helpers, and three CSS/runtime entrypoints. The demonstration routes stay in this repository and are not packed.

`@wpmoo/astro` is licensed under the [MIT license](LICENSE). It is the reusable foundation for independently licensed themes and extensions. The package remains marked `private` until a separate release decision. Third-party dependencies, including `@wpmoo/ui`, retain their own licenses.

## Install and compose a page

After the adapter is published, install it in an Astro application:

```bash
npm install @wpmoo/astro astro@7.3.3
```

The package pins `@wpmoo/ui` to `1.0.0-rc.9` and Bootstrap to `5.3.8`. The application supplies the certified `astro@7.3.3` peer; the adapter's development checks use that same version. MDX is an explicit host opt-in and is absent from the MD-only consumer. Layout imports the canonical Moo CSS and places the published state script at the document owner and Sidebar wrapper before their visible branches render. Astro owns routes, page content, and host state.

Local checks use the approved exact development pins `@astrojs/check@0.9.10` and `typescript@6.0.3`. Run `npm run check` for the real Astro checker and `npm run build` for compilation. Each independent consumer has its own strict TypeScript configuration and checks its public imports before building. The local `@astrojs/mdx@8.0.2` development pin prepares the separate MDX certification; it is not installed by consumers of this package.

```astro
---
import Layout from "@wpmoo/astro/Layout.astro";
import Sidebar from "@wpmoo/astro/components/Sidebar.astro";
import Button from "@wpmoo/astro/components/Button.astro";

const groups = [{
  label: "Workspace",
  items: [{ title: "Overview", href: "/", icon: "panel-left", active: true }],
}];
---

<Layout title="Dashboard" sidebar theme="dark" sidebarKey="dashboard" sidebarId="dashboard-sidebar">
  <Sidebar slot="sidebar" id="dashboard-sidebar" brand="Moo UI" groups={groups} />
  <h1>Dashboard</h1>
  <Button href="/settings">Settings</Button>
</Layout>
```

Omit `sidebar` and the Sidebar slot for a page without a Sidebar. When `sidebar` is present, the slot is required and its `id` must match `sidebarId`. Layout supports the registered `shellMode`, `pageWidth`, `headerWidth`, `theme`, and `dir` values. Use its `header` and `footer` slots for page regions. `Sidebar` contributes the direct `<aside>` branch, while Layout supplies the app wrapper, Page rail, trigger, and initialization.

The current RC9 `contained` shell forces its Sidebar into document flow below 992 px. The long-navigation mobile example is rejected and is not an accepted regression baseline. Correct mobile drawer behavior requires a Moo Core contract correction; the adapter does not override the published CSS or substitute a controller. Desktop containment and the `viewport` mobile drawer are separate verified behaviors.

The Page main rail exposes `data-page-container`. Bootstrap rows can opt into Moo's available-width grid with `data-layout="page-grid"`, a base `col-N` on each direct item, and registered `data-page-col-lg`, `data-page-show-from`, or `data-page-hide-from` attributes. The published CSS handles the expanded, collapsed, overlay, and absent Sidebar states. The local `src/pages/index.astro` demonstrates this composition; it is not part of the package.

The running demo also exposes `/preview/single` with an explicit Sidebar and `/preview/archive` without a Sidebar option. Both routes compose the public includes and generic views; these preview pages are excluded from the package archive.

## Public files and behavior

Each wrapper has a direct public entrypoint such as `@wpmoo/astro/components/Button.astro`. Import only published subpaths from another application. The following entrypoints let a custom theme use the same shared presentation and behavior outside Layout:

```astro
---
import "@wpmoo/astro/styles.css";
---
<script>
  import "@wpmoo/astro/runtime/bootstrap.js";
  import { Chart } from "@wpmoo/astro/runtime/moo-ui.js";
  document.querySelectorAll(".chart").forEach((root) => Chart.getOrCreateInstance(root));
</script>
```

The Bootstrap facade exposes the installed Bootstrap ESM namespace to the published Moo Sidebar runtime. The Moo facade re-exports the published Core ESM module; its optional components are initialized on caller-owned roots. Layout already loads both facades and initializes its own Sidebar. Its declaration covers the shared `getInstance`, `getOrCreateInstance`, construction and disposal lifecycle of the nine RC9 constructors; it does not advertise additional component-specific methods.

`@wpmoo/astro/config` exports `defineSite`, `resolvePageOptions`, `layoutSchema`, `getEntryClasses`, `getPageClasses`, and `normalizeSlug`. It resolves partial site, content-type, view, and page preferences without loading content or registering routes. For example:

```js
import { defineSite, normalizeSlug, resolvePageOptions } from "@wpmoo/astro/config";

const site = defineSite({
  types: { post: { sidebar: {}, views: { single: { sidebar: null } } } },
});
const options = resolvePageOptions(site, "post", "single");
const slug = normalizeSlug("Contact Us", { lang: "en" });
```

Here `options.sidebar` is `null` and `slug` is `"contact-us"`. An omitted Sidebar option defaults to `null`; `sidebar: {}` enables Moo's default Sidebar preferences; `sidebar: null` disables an inherited Sidebar for a type, view, or individual page without erasing its field preferences. A later `sidebar: {}` re-enables those preferences. A route passes `sidebar={options.sidebar !== null}` to Layout and supplies the Sidebar slot only when enabled. The config entrypoint does not activate Page/Post plugins or add routes; those features are separate work.

`@wpmoo/astro/plugins` exports `definePlugin`. Its versioned descriptor records a content type, declared local source, Single route ownership, and optional navigation as validated immutable data. Defining a plugin performs no file load, content query, route injection, or UI initialization. The root `moo()` integration activates the supplied descriptors; `page()` is the default. `page({ routes: { single: "host" } })` makes the host supply its own `src/pages/[...slug].astro` using the public query and view helpers. The local demo uses this documented boundary to compose its example Sidebar; demo files stay outside the package.

`@wpmoo/astro/content` provides `sourceEntryId`, `jsonEntryId`, and the shared strict `entrySchema`. `@wpmoo/astro/plugins/page` provides the pure `page()` descriptor; its `/content` and `/queries` subpaths provide `pageSchema`, `getPublishedPages()`, and `getPagePaths()`. The host declares its native Astro collection with `defineCollection()` and `glob()`:

```ts
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { sourceEntryId } from "@wpmoo/astro/content";
import { pageSchema } from "@wpmoo/astro/plugins/page/content";

export const collections = {
  page: defineCollection({
    loader: glob({ base: new URL("./content/page/", import.meta.url), pattern: "**/*.md", generateId: sourceEntryId }),
    schema: pageSchema,
  }),
};
```

Page frontmatter requires `title` and `status: publish|draft|pending|future`; `slug`, three authored dates, navigation labels/order, and `layout` preferences are optional. Source IDs retain their exact relative `.md` or `.mdx` filenames. The slug controls only the URL. Only published Pages appear in the query results and paths; scheduled Pages reserve their canonical URL. The integration validates source identity and data before rendering. Post, taxonomy, SEO and native multilingual routing remain implementation tasks.

String props are escaped by default. `trustedHtml` is only for trusted, caller-owned markup. Do not enable it for user or remote content.

## Theme language and visible copy

The host theme owns its translations. Resolve the language of a route, then pass translated text through the public component props. This includes empty states, headings, breadcrumbs, button labels, placeholders, and ARIA labels; changing `<html lang>` alone does not translate them. For a one-language site, `site.defaults.lang` is the fallback. When the host configures Astro's native i18n, `Astro.currentLocale` supplies the route language:

```astro
---
import Layout from "@wpmoo/astro/Layout.astro";
import Loop from "@wpmoo/astro/views/Loop.astro";
import { getSiteContext } from "@wpmoo/astro/context";
import { getMessages } from "../messages.js"; // owned by the theme

const lang = Astro.currentLocale ?? getSiteContext().site.defaults.lang;
const copy = getMessages(lang);
const items = [];
---

<Layout title={copy.title} lang={lang}>
  <h1>{copy.title}</h1>
  <Loop items={items} emptyText={copy.emptyItems} />
</Layout>
```

The repository-only `/preview/i18n-empty` route demonstrates this with Turkish, German, and English theme copy and the generic/Page Loop empty-state props. The existing English defaults are fallbacks for callers that do not supply copy; multilingual themes should always supply it. Built-in content routing still uses one configured language. Locale-specific content URLs, translated entry links, and per-route built-in labels require the planned native Astro i18n work before a multilingual site can be certified.

Published Moo UI RC9 still writes English labels from its DataTable runtime (for example the live result summary and generated page controls) and DatePicker calendar runtime (navigation ARIA labels and preset names), even when a page language or date locale is supplied. Astro does not replace those scripts. A published Moo label configuration contract is needed before these interactive components can be certified for multilingual themes.

## Develop and verify

From the workspace root, `make ui-astro` serves the local demonstration on port 4322. `make sync` follows the HTML `dev` branch for local integration and leaves the release pin in `package.json` and `package-lock.json` intact. Do not treat the local development package as the published RC9 release.

The `moo()` integration separates the default build and sync Vite caches from the development cache, so these commands can run while the existing development server stays open. An explicit host `vite.cacheDir` remains unchanged; a host choosing its own cache must keep concurrent commands isolated. After a runtime upgrade, reload the browser to request the current modules. The live regression `python3 tests/test_dev_runtime_build.py` uses the existing 4322 server and checks that a build preserves both public runtime responses.

From this package directory:

```bash
npm test
npm run build
npm pack --dry-run
node scripts/sync_package_baseline.mjs --check-release
node scripts/verify_astro_boundary.mjs --mode release
python3 tests/test_page_collection.py -v
python3 tests/test_visual_acceptance.py -v
python3 tests/test_shared_parts_acceptance.py -v
```

The visual test needs Python Playwright with Chromium and the existing server on port 4322; `ASTRO_BASE_URL` can point it at the same accepted surface in a packed consumer. Development layout provenance is checked separately with `node scripts/verify_astro_boundary.mjs --mode dev` against the reviewed `projects/ui/html` commit. `contracts/layout-surface.snapshot.json` is an integration snapshot, not a packed release file.

For an independent install, first prime an isolated npm cache from `tests/fixtures/consumer/package-lock.json` and the current adapter tarball. Then run `scripts/verify_packed_consumer.mjs --cache /absolute/cache --output /absolute/empty-directory` in a Node >=22.12 container with networking disabled. The script packs the adapter, runs `npm ci --offline` outside the workspace, resolves all 62 source entrypoints from the package, rejects a private deep import, builds the fixture, and retains the archive, installed consumer, built HTML, and hashes. Run `python3 tests/test_packed_runtime.py /absolute/output/consumer/dist -v` to exercise that built page and its assets in Chromium without a server.

The exact public exports and packed files are recorded in `contracts/astro-public-surface.json`. The published Core export targets and hashes are recorded in `contracts/rc9-package.json`. The release gate checks the registry lock, installed Core bytes, archive closure, and public export map without reading the sibling HTML checkout or using the network.
