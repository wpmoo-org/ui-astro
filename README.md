# Moo UI Astro adapter

`@wpmoo/astro` composes Astro pages from the published `@wpmoo/ui@1.0.0-rc.9` CSS, state script, and ESM components. Its package has 45 public component wrappers, one Layout, four shared includes, three generic views, pure configuration and plugin-descriptor entrypoints, and three CSS/runtime entrypoints. The demonstration routes stay in this repository and are not packed.

## Install and compose a page

After the adapter is published, install it in an Astro application:

```bash
npm install @wpmoo/astro
```

The dependency pins `@wpmoo/ui` to `1.0.0-rc.9` and carries Astro and Bootstrap. Layout imports the canonical Moo CSS and places the published state script at the document owner and Sidebar wrapper before their visible branches render. Astro owns routes, page content, and host state.

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

The Bootstrap facade exposes the installed Bootstrap ESM namespace to the published Moo Sidebar runtime. The Moo facade re-exports the published Core ESM module; its optional components are initialized on caller-owned roots. Layout already loads both facades and initializes its own Sidebar.

`@wpmoo/astro/config` exports `defineSite`, `resolvePageOptions`, `layoutSchema`, `getEntryClasses`, `getPageClasses`, and `normalizeSlug`. It resolves partial site, content-type, view, and page preferences without loading content or registering routes. For example:

```js
import { defineSite, normalizeSlug, resolvePageOptions } from "@wpmoo/astro/config";

const site = defineSite({
  types: { post: { sidebar: {}, views: { single: { sidebar: null } } } },
});
const options = resolvePageOptions(site, "post", "single");
const slug = normalizeSlug("İletişim", { lang: "tr" });
```

Here `options.sidebar` is `null` and `slug` is `"iletisim"`. An omitted Sidebar option defaults to `null`; `sidebar: {}` enables Moo's default Sidebar preferences; `sidebar: null` disables an inherited Sidebar for a type, view, or individual page without erasing its field preferences. A later `sidebar: {}` re-enables those preferences. A route passes `sidebar={options.sidebar !== null}` to Layout and supplies the Sidebar slot only when enabled. The config entrypoint does not activate Page/Post plugins or add routes; those features are separate work.

`@wpmoo/astro/plugins` exports `definePlugin`. Its versioned descriptor records a content type, declared local source, Single route ownership, and optional navigation as validated immutable data. Defining a plugin performs no file load, content query, route injection, or UI initialization. The integration that activates descriptors is a separate feature and is not available in this build.

String props are escaped by default. `trustedHtml` is only for trusted, caller-owned markup. Do not enable it for user or remote content.

## Develop and verify

From the workspace root, `make ui-astro` serves the local demonstration on port 4322. `make sync` follows the HTML `dev` branch for local integration and leaves the release pin in `package.json` and `package-lock.json` intact. Do not treat the local development package as the published RC9 release.

From this package directory:

```bash
npm test
npm run build
npm pack --dry-run
node scripts/sync_package_baseline.mjs --check-release
node scripts/verify_astro_boundary.mjs --mode release
python3 tests/test_visual_acceptance.py -v
python3 tests/test_shared_parts_acceptance.py -v
```

The visual test needs Python Playwright with Chromium and the existing server on port 4322; `ASTRO_BASE_URL` can point it at the same accepted surface in a packed consumer. Development layout provenance is checked separately with `node scripts/verify_astro_boundary.mjs --mode dev` against the reviewed `projects/ui/html` commit. `contracts/layout-surface.snapshot.json` is an integration snapshot, not a packed release file.

For an independent install, first prime an isolated npm cache from `tests/fixtures/consumer/package-lock.json` and the current adapter tarball. Then run `scripts/verify_packed_consumer.mjs --cache /absolute/cache --output /absolute/empty-directory` in a Node >=22.12 container with networking disabled. The script packs the adapter, runs `npm ci --offline` outside the workspace, resolves all 58 source entrypoints from the package, rejects a private deep import, builds the fixture, and retains the archive, installed consumer, built HTML, and hashes. Run `python3 tests/test_packed_runtime.py /absolute/output/consumer/dist -v` to exercise that built page and its assets in Chromium without a server.

The exact public exports and packed files are recorded in `contracts/astro-public-surface.json`. The published Core export targets and hashes are recorded in `contracts/rc9-package.json`. The release gate checks the registry lock, installed Core bytes, archive closure, and public export map without reading the sibling HTML checkout or using the network.
