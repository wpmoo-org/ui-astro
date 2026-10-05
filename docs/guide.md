# Moo UI Astro guide

Installation, composition and development details for Moo UI Astro.
For a short overview, see the [README](../README.md).

## Contents

- [Installation and Layout](#install-and-compose-a-page)
- [Native 404](#native-404)
- [Public components and runtime](#public-files-and-behavior)
- [Theme preferences](#theme-preferences)
- [MDX and native Astro sections](#explicit-mdx-and-native-astro-sections)
- [Post content and routes](#post-content-and-routes)
- [Host routes and custom content types](#theme-routes-and-external-content-types)
- [Shared taxonomies](#optional-shared-taxonomies)
- [Native JSON and integrity](#native-json-storage-and-integrity)
- [CMS adapter boundaries](#cms-free-authoring-and-future-editor-adapters)
- [SEO](#seo-from-ordinary-content)
- [Languages](#theme-language-and-visible-copy)
- [Development and verification](#develop-and-verify)
- [Reference theme and pilot](#reference-theme-and-pilot)
- [Theme and plugin upgrades](#upgrade-a-theme-or-plugin)

`@wpmoo/astro` composes Astro pages from the published `@wpmoo/ui@1.0.0` CSS, state script, and ESM components. Its package has 45 public component wrappers, one Layout, four shared includes, three generic views, pure configuration and plugin-descriptor entrypoints, Page/Post descriptors, schemas, native queries and specialized views, and three CSS/runtime entrypoints. The demonstration routes stay in this repository and are not packed.

`@wpmoo/astro` is licensed under the [MIT license](../packages/astro/LICENSE). It is the reusable foundation for independently licensed themes and extensions. The package remains marked `private` until a separate release decision. Third-party dependencies, including `@wpmoo/ui`, retain their own licenses.

## Install and compose a page

Use Node.js `22.12.0` or newer and the certified Astro `7.3.3`.

After the adapter is published, install it in an Astro application:

```bash
npm install @wpmoo/astro astro@7.3.3
```

The current `0.1.0` candidate is unpublished. To evaluate it now, install a
reviewed local archive instead of assuming that npm serves this candidate:

```bash
npm install /absolute/path/wpmoo-astro-0.1.0.tgz astro@7.3.3
```

Use a separate application and its own committed lockfile. No demo content,
host content config, host pages or CMS is installed with the package.

The package pins `@wpmoo/ui` to `1.0.0` and Bootstrap to `5.3.8`. The application supplies the certified `astro@7.3.3` peer; the adapter's development checks use that same version. MDX is an explicit host opt-in and is absent from the MD-only consumer. Layout imports the canonical Moo CSS and places the published state script at the document owner and Sidebar wrapper before their visible branches render. Astro owns routes, page content, and host state.

Local checks use the approved exact development pins `@astrojs/check@0.9.10` and `typescript@6.0.3`. Run `npm run check` for the real Astro checker and `npm run build` for compilation. Each independent consumer has its own strict TypeScript configuration and checks its public imports before building. The local `@astrojs/mdx@8.0.2` development pin prepares the separate MDX certification; it is not installed by consumers of this package.

```astro
---
import Layout from "@wpmoo/astro/Layout.astro";
import Sidebar from "@wpmoo/astro/components/Sidebar.astro";
import Button from "@wpmoo/astro/components/Button.astro";

const groups = [
  {
    label: "Workspace",
    items: [{ title: "Overview", href: "/", icon: "panel-left", active: true }],
  },
];
---

<Layout
  title="Dashboard"
  sidebar
  theme="dark"
  sidebarKey="dashboard"
  sidebarId="dashboard-sidebar"
>
  <Sidebar
    slot="sidebar"
    id="dashboard-sidebar"
    brand="Moo UI"
    groups={groups}
  />
  <h1>Dashboard</h1>
  <Button href="/settings">Settings</Button>
</Layout>
```

Omit `sidebar` and the Sidebar slot for a page without a Sidebar. When `sidebar` is present, the slot is required and its `id` must match `sidebarId`. Layout supports the registered `shellMode`, `pageWidth`, `headerWidth`, `theme`, and `dir` values. Use its `header` and `footer` slots for page regions. `Sidebar` contributes the direct `<aside>` branch, while Layout supplies the app wrapper, Page rail, trigger, and initialization.

Layout also supplies a Moo Button link to `#main-content`, hidden until keyboard focus by Bootstrap's registered `visually-hidden-focusable` helper. Its nonempty `skipText` defaults to `"Skip to main content"`; a multilingual theme supplies translated text through this prop. The link provides direct keyboard access to the main region and preserves Bootstrap's reverse-Tab loop when a mobile Sidebar is open.

RC9 forced the `contained` Sidebar into document flow below 992 px. That rejected long-navigation result remains historical evidence. The RC10 artifact removes the Core override; the adapter consumes its published CSS and Sidebar runtime directly, without a local CSS override or replacement controller. The current mobile behavior is verified separately from desktop containment.

The Page main rail exposes `data-page-container`. Bootstrap rows can opt into Moo's available-width grid with `data-layout="page-grid"`, a base `col-N` on each direct item, and registered `data-page-col-lg`, `data-page-show-from`, or `data-page-hide-from` attributes. The published CSS handles the expanded, collapsed, overlay, and absent Sidebar states. The local `apps/demo/pages/index.astro` demonstrates this composition; it is not part of the package.

The running demo exposes `/preview/single` and `/preview/archive` through its
shared Sidebar. Only explicitly Sidebarless examples opt out. Both routes
compose public includes and generic views; the preview pages are excluded
from the package archive.

## Native 404

Register `moo()` to receive the default native 404, including configured locale
errors. It also works with `moo({ plugins: [] })` without content collections.
Partial `notFound.messages` dictionaries replace individual English/German
defaults; missing fields fall back to the main language, then English.

For a theme override, select `notFound: { routeOwner: "host" }` and provide each
required native `404.astro`. Use `getNotFoundOptions(Astro.currentLocale)` from
`@wpmoo/astro/not-found`, the public `views/NotFound.astro` and Layout with
`metadata={null}`. The view exposes `page-header` and `actions` slots and inherits
shared Page single preferences. A static host must serve the generated error
document with HTTP 404 and configure locale error selection separately.

## Public files and behavior

Each wrapper has a direct public entrypoint such as `@wpmoo/astro/components/Button.astro`. Import only published subpaths from another application. The following entrypoints let a custom theme use the same shared presentation and behavior outside Layout:

```astro
---
import "@wpmoo/astro/styles.css";
---

<script>
  import "@wpmoo/astro/runtime/bootstrap.js";
  import { loadChart } from "@wpmoo/astro/runtime/moo-ui.js";
  async function initializeCharts() {
    const roots = document.querySelectorAll(".chart");
    if (!roots.length) return;
    const Chart = await loadChart();
    roots.forEach((root) => Chart.getOrCreateInstance(root));
  }
  void initializeCharts();
</script>
```

The Bootstrap facade exposes the installed Bootstrap ESM namespace to the published Moo Sidebar runtime. The Moo facade re-exports the published Core ESM module; its optional components are initialized on caller-owned roots. Layout already loads both facades and initializes its own Sidebar. Its declaration covers the shared `getInstance`, `getOrCreateInstance`, construction and disposal lifecycle of the eight aggregate constructors and the asynchronously loaded Chart constructor. RC10 exposes `loadChart()` (also `MooUI.loadChart()`), with no synchronous aggregate `Chart` export. Repeated loads share the dedicated Chart module's constructor; Chart dependencies load only when requested.

RC10 also exposes `initSheets(root)` through this facade. Call it after the Bootstrap facade is loaded to enable the published Sheet autofocus and open-on-load behavior on that Document or Element. It returns a disposer; the host owns when to initialize and dispose it. Layout does not initialize optional Sheets automatically.

`@wpmoo/astro/config` exports `defineSite`, `resolvePageOptions`, `resolveParts`, `formatDate`, `layoutSchema`, `getEntryClasses`, `getPageClasses`, and `normalizeSlug`. It resolves partial site, content-type, view, and page preferences without loading content or registering routes. For example:

```js
import {
  defineSite,
  normalizeSlug,
  resolvePageOptions,
} from "@wpmoo/astro/config";

const site = defineSite({
  types: { post: { sidebar: {}, views: { single: { sidebar: null } } } },
});
const options = resolvePageOptions(site, "post", "single");
const slug = normalizeSlug("Contact Us", { lang: "en" });
```

Here `options.sidebar` is `null` and `slug` is `"contact-us"`. An omitted Sidebar option defaults to `null`; `sidebar: {}` enables Moo's default Sidebar preferences; `sidebar: null` disables an inherited Sidebar for a type, view, or individual page without erasing its field preferences. A later `sidebar: {}` re-enables those preferences. A route passes `sidebar={options.sidebar !== null}` to Layout and supplies the Sidebar slot only when enabled. The config entrypoint does not activate Page/Post plugins or add routes; the root integration selects those features.

### Theme preferences

One `parts` record supplies shared appearance and display choices. Its precedence is package fallback → `site.defaults` → `site.types[type]` → the selected `views.single`/`views.archive` → the entry's `options` or explicit route override. Known nested fields merge; arrays replace, including `[]`. Omitted/undefined fields inherit. Null is invalid for `parts`; Sidebar null still disables the Sidebar. Inputs are validated and copied; resolved records and arrays are readonly.

```js
const siteInput = {
  defaults: {
    parts: {
      content: { utilities: ["py-3", "py-md-5"] },
      header: { utilities: ["bg-body-tertiary", "border-bottom"] },
      loop: { dateStyle: "long" },
    },
  },
  types: {
    post: {
      views: { single: { parts: { content: { utilities: ["py-2"] } } } },
    },
  },
};
const site = defineSite(siteInput);
```

Use the authored object as `moo({ site: siteInput, plugins: [...] })` input. A single Markdown/MDX entry can replace its inherited content spacing without changing another entry or its archive:

```yaml
options:
  parts:
    content:
      utilities: []
```

**Unpublished metadata migration:** MD, MDX and JSON collection entries use `options`. Rename the former authored `layout` field and any `entry.data.layout` access to `options` and `entry.data.options`. Public `Layout`, `layoutSchema` and `resolvePageOptions` retain their names. The selected official MDX compiler treats truthy `layout` as a component import even in collections. Moo schemas reject that former key with migration guidance; legacy object-valued MDX may fail in the official compiler first. No alias or generated-code workaround is provided.

Layout applies `parts.content.utilities` exactly once, on the existing `data-page-container`. Single, Archive and Loop add no outer page padding. Built-in routes pass resolved parts to the Layout, includes and views. A host-authored route or collection-free composition explicitly passes the same `parts={options.parts}` to its Layout and child includes/views; there is no implicit view context. `resolveParts()` provides the same fallback for standalone components.

| Part             | Options and fallback                                                                                                                                                                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `content`        | `utilities: ['py-4']`; `scrollUtilities: ['scroll-fade-y', 'no-scrollbar']` on the existing main owner                                                                                                                                                |
| `header`         | Region `utilities: ['bg-body', 'border-bottom']`; `contentUtilities: ['d-flex', 'align-items-center', 'gap-2', 'py-2']`; `breadcrumbUtilities: ['mb-0']`                                                                                              |
| `header.trigger` | Published Button `variant: 'ghost'`, `size: 'icon-sm'`, `icon: 'panel-left'`                                                                                                                                                                          |
| `header` copy    | `toggleLabel`, `navigationLabel`, `breadcrumbLabel`, `skipLabel`; English fallback, explicit host translations                                                                                                                                        |
| `pageHeader`     | `utilities: ['d-flex', 'flex-column', 'gap-2', 'mb-4']`; `titleUtilities: ['mb-0']`; `descriptionUtilities: []`; `descriptionVariant: 'page-description'` or `'muted'`                                                                                |
| `loop`           | `utilities: ['list-unstyled', 'd-flex', 'flex-column', 'gap-4']`; `itemUtilities: ['d-flex', 'flex-column', 'gap-2']`; `titleUtilities: ['mb-0']`; `descriptionUtilities: ['text-body-secondary', 'mb-0']`; `emptyUtilities: ['text-body-secondary']` |
| `loop` display   | `titleVariant: 'section-title'` or `'subsection-title'`; `dateStyle: 'iso'` (default), `'short'`, `'medium'`, `'long'`, `'full'`; `emptyText`, `pageEmptyText`, `postEmptyText`, `pageTitle`, `postTitle`                                             |
| `footer`         | `utilities: []` on the existing region; `linkUtilities: ['link-body-emphasis']` on its fallback link                                                                                                                                                  |

The public `UtilityToken` type enumerates registered spacing (0–5 and responsive breakpoints), display/flex/alignment, text/background/link color, weight, border and rounded helpers. Custom classes, CSS values, HTML and file paths are rejected. PageHeader has narrower typed bounds because published Moo Typography owns some styles: `page-title` fixes `fw-semibold`; both description variants fix `text-body-secondary`; `page-description` fixes `mb-0`. Incompatible title weight, description color and nonzero bottom-margin utilities fail with their `parts.pageHeader` field. Responsive `m`/`my` utilities that change that bottom margin also fail. Alignment, title margins and description top margins remain configurable. An explicit `descriptionVariant: 'muted'` permits other description margins; repeat that variant in a layer that supplies them. Switching back to `page-description` also validates inherited utilities. The current Typography contract has no public prop to replace the fixed weight/color mappings; this Core capability gap is retained instead of accepting an ineffective override.

Public Typography semantic roles remain unchanged. Full content-region replacement uses the existing `page-header`, `metadata`, `actions`, `loop`, `after-list` and `after-content` slots. This setting does not add a stylesheet or replace a Moo controller.

`formatDate(date, { lang, style, formatter? })` returns display text. Named styles use `Intl.DateTimeFormat` with UTC; `iso` returns `YYYY-MM-DD`. Generic Archive/Loop and Post Single accept display `lang` and a trusted caller `dateFormatter` function. Specialized Page/Post Archive and Loop retain `lang` for canonical URL normalization and add `dateLang` for display (default: `lang`). Built-in Post Archive passes the site's canonical default language to link generation and the resolved Archive language to date display. A view/entry display preference does not change generated route identity. The function receives a Date copy and must return text; Astro escapes that text. The original ISO `datetime`, publication instant and status remain unchanged. Functions are caller code, never frontmatter. Explicit legacy `emptyText`, `titleVariant`, ARIA text or date formatter props take precedence over the corresponding part fallback.

This unpublished candidate adds `parts` to normalized output and changes the default outer content spacing from zero to `py-4`. Existing authored fields retain their meaning. The maintainer accepted the configurable spacing foundation on 2026-10-01; positive browser contracts cover inherited Layout spacing, a Contact-only override and independent heading/item gaps. This acceptance does not certify a finished theme design or release compatibility.

`@wpmoo/astro/plugins` exports `definePlugin`. Its versioned descriptor records a content type, declared local source, Single route ownership, and optional navigation as validated immutable data. Defining a plugin performs no file load, content query, route injection, or UI initialization. The root `moo()` integration activates the supplied descriptors. Omitting `plugins` selects `page()` plus `post()` and requires both native collections. An explicit list replaces the defaults: `[page()]` needs only Page, `[post()]` needs only Post, and `[]` adds no content routes or collection requirements. `page({ routes: { single: "host" } })` makes the host supply its own `src/pages/[...slug].astro` using the public query and view helpers.

| Host choice                              | Required native collections | Route owner            |
| ---------------------------------------- | --------------------------- | ---------------------- |
| `moo()`                                  | `page` and `post`           | Package defaults       |
| `moo({ plugins: [page()] })`             | `page`                      | Page plugin by default |
| `moo({ plugins: [post()] })`             | `post`                      | Post plugin by default |
| `moo({ plugins: [], taxonomies: [] })`   | None                        | Host only              |
| Component/Layout imports without `moo()` | None                        | Host only              |

Select only the features the application uses. Disabling a plugin stops its
activation; its source remains in the one package archive.

The private demo selects host-owned Page, Post and taxonomy routes, which compose one shared demo Layout and navigation. It enables the Sidebar once in `site.defaults`; Contact and the announcement explicitly opt out with entry `options.sidebar: null`. Other examples inherit that Sidebar, including archives, terms and the native Astro page. These host choices and all demo files stay outside the npm package. The package's default Sidebar remains disabled.

`@wpmoo/astro/content` provides `sourceEntryId`, `jsonEntryId`, and the shared strict `entrySchema`. `@wpmoo/astro/plugins/page` provides the pure `page()` descriptor; its `/content` and `/queries` subpaths provide `pageSchema`, `getPublishedPages()`, and `getPagePaths()`. A Page-only host selects that descriptor in `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";

export default defineConfig({ integrations: [moo({ plugins: [page()] })] });
```

The host declares its native Astro collection with `defineCollection()` and `glob()`:

```ts
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { sourceEntryId } from "@wpmoo/astro/content";
import { pageSchema } from "@wpmoo/astro/plugins/page/content";

export const collections = {
  page: defineCollection({
    loader: glob({
      base: new URL("./content/page/", import.meta.url),
      pattern: "**/*.md",
      generateId: sourceEntryId,
    }),
    schema: pageSchema,
  }),
};
```

Page frontmatter requires `title` and `status: publish|draft|pending|future`; `slug`, three authored dates, navigation labels/order, and `options` preferences are optional. Source IDs retain their exact relative `.md` or `.mdx` filenames. The slug controls only the URL. Only published Pages appear in the query results and paths; scheduled Pages reserve their canonical URL. The integration validates source identity and data before rendering. The sections below describe optional shared taxonomy, SEO and native static locales.

### Explicit MDX and native Astro sections

Ordinary content uses Markdown. To enable trusted authored MDX, the host adds
the certified optional integration and declares the format on every selected
Markdown source that may contain MDX:

```bash
npm install @astrojs/mdx@8.0.2
```

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";

export default defineConfig({
  integrations: [mdx(), moo({ plugins: [page({ formats: ["md", "mdx"] })] })],
});
```

In the Page collection recipe above, use
`pattern: "**/*.{md,mdx}"` while retaining `generateId: sourceEntryId` and
`schema: pageSchema`. Post uses the same format declaration and its own
`postSchema`. Omitting MDX activation for declared MDX source fails the source
integrity check; it does not silently publish only the Markdown subset.

For example, `src/content/page/enhanced.mdx` can import a host component:

```mdx
---
title: Enhanced page
status: publish
slug: enhanced
options:
  parts:
    content:
      utilities: [py-3]
---

import Hero from "../../components/Hero.astro";

<Hero
  title="Reusable host section"
  description="Content selected by the host."
/>

Ordinary prose follows the same Page schema and Layout.
```

That relative import follows the file's actual location; moving multilingual
source into another directory also requires updating its relative imports.
The host owns `src/components/Hero.astro`; the package supplies no Hero or
section-discovery convention. A native route can import that exact component
without becoming a collection entry:

```astro
---
import Layout from "@wpmoo/astro/Layout.astro";
import Hero from "../components/Hero.astro";
import { resolveParts } from "@wpmoo/astro/config";

const parts = resolveParts({ content: { utilities: ["py-3"] } });
---

<Layout
  title="Landing"
  parts={parts}
  pageContext={{ view: "native", key: "landing" }}
>
  <h1>Landing</h1>
  <Hero
    title="Reusable host section"
    description="The same component used in MDX."
  />
</Layout>
```

The Hero in this example renders a section heading below the page's `h1`.
Native routes can instead replace the generic view's `page-header` slot and
select the component's page-heading role explicitly. MDX executes trusted
author imports and expressions; a future content-only editor must treat that
code as read-only unless separately certified. It is not equivalent to plain
Markdown editor input.

### Post content and routes

`@wpmoo/astro/plugins/post` exports `post()`. Its `/content` and `/queries` subpaths export `postSchema`, `getPublishedPosts()` and `getPostPaths({ basePath?, lang? })`. The specialized `/views/Single.astro`, `/views/Archive.astro` and `/views/Loop.astro` accept supplied native Post entries and forward the generic named slots; they add no queries or document owner. The default mount is `/posts` with the label `Posts`. A different label leaves type, collection and source identity as `post`; a mount change changes public URLs and creates no automatic redirects.

For example, add Post to a Page site and make its Single Sidebar optional:

```js
import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
import { post } from "@wpmoo/astro/plugins/post";

export default defineConfig({
  integrations: [
    moo({
      plugins: [page(), post({ label: "News", basePath: "/news" })],
      site: {
        types: { post: { sidebar: {}, views: { single: { sidebar: null } } } },
      },
    }),
  ],
});
```

Add a `post` collection beside `page` in the host content config:

```ts
import { postSchema } from "@wpmoo/astro/plugins/post/content";

// Use defineCollection, glob and sourceEntryId from the Page example.
const post = defineCollection({
  loader: glob({
    base: new URL("./content/post/", import.meta.url),
    pattern: "**/*.md",
    generateId: sourceEntryId,
  }),
  schema: postSchema,
});
// Include this collection in the exported collections object.
```

A Post needs a nonempty `title` and explicit `status`. Published Posts and all `future` entries also need a quoted, timezone-qualified `published_at`, such as `"2026-09-20T12:00:00Z"`. `description`, `slug`, `created_at`, `updated_at` and `options` are optional. Invalid dates, ambiguous local timestamps and a future timestamp with `status: publish` fail validation. Draft, pending and future content stays out of public routes and lists; an elapsed future timestamp alone does not change its status. Queries sort published Posts by newest timestamp, then exact source ID; default metadata shows the UTC date.

`options: { sidebar: {} }` on one Post restores its Single Sidebar without changing another Single or the Archive. Native routes resolve these preferences separately. A custom Single or Archive route selects `routes: { single: "host" }` or `routes: { archive: "host" }` and supplies the matching native prerendered route; missing or duplicate ownership fails with a named diagnostic. Query/view callers outside those routes pass the configured mount, language, host base and slash policy explicitly. Standalone UI composition remains valid without the root integration.

The Post examples at `/posts`, `/posts/announcement` and `/posts/layout-options` have layout acceptance. Positive browser contracts preserve their region ownership, independent Sidebar preferences and canonical links. Padding and final theme styling remain open; these are foundation examples, not a finished theme or a release claim.

Labels and namespaces are host values, for example
`post({ label: "Blog", basePath: "/blog" })` or
`post({ label: "Aktuelles", basePath: "/aktuelles" })`. Type and collection
identity remain `post`; changing a namespace requires explicit redirects for
previously published URLs.

String props are escaped by default. `trustedHtml` is only for trusted, caller-owned markup. Do not enable it for user or remote content.

### Theme routes and external content types

Generic Single/Archive/Loop are collection-free and accept supplied props and
slots. Specialized Page/Post views accept native entries or supplied lists;
they do not select collections or own a second document. A host route resolves
its entry's `options`, passes the resulting parts to Layout/includes/views,
and renders the body with Astro's public `render(entry)`.

With `page({ routes: { single: "host" } })`, implement the matching native
prerendered route and return `getPagePaths()` from its `getStaticPaths()`.
If `/about` also has an explicit native route, filter that entry out of the
theme catch-all so that only `/about` produces its URL. Use the entry's stable
source ID for the filter, not its display title. Missing/duplicate host route
declarations fail validation. Every active content build compares advertised
published URLs with emitted routes, including single-language hosts. A
matching catch-all alone does not prove that its `getStaticPaths()` emits those
Pages. This companion-route recipe applies when no root taxonomy shares the
Page producer; a combined root group uses the dispatcher described below.
Choosing host ownership retains
active collection, source, schema, taxonomy, navigation and canonical metadata;
it suppresses only package route injection.

An external CPT uses the pure `definePlugin()` API with `apiVersion: 1`, a
stable plugin/type/collection identity, canonical `basePath`, declared source
and a `singleRoute` naming one of its local route IDs. Sources are Markdown
with explicit formats, a root JSON array or a flat JSON directory. A plugin
owns static prerendered entrypoints through local `URL` values, or declares
`owner: "host"` with no entrypoint. Bound taxonomies are explicit type metadata.
Route IDs such as `single` may repeat across plugins; the final identity is
namespaced by the plugin ID. A separately distributed plugin declares and
tests its compatible `@wpmoo/astro` and Astro peers and commits its own lock.
This foundation supplies no importer, plugin auto-discovery or template lookup.

Define a site's Projects type in its own `definitions.js`, for example:

```js
import { definePlugin } from "@wpmoo/astro/plugins";

export function projects() {
  return definePlugin({
    apiVersion: 1,
    id: "projects",
    label: "Projects",
    basePath: "/project",
    locales: { de: { label: "Projekte", basePath: "/projekt" } },
    contentTypes: [
      {
        id: "project",
        collection: "project",
        singleRoute: "single",
        source: {
          kind: "markdown",
          formats: ["md"],
          base: new URL("./content/project/", import.meta.url),
        },
        taxonomies: ["category", "tag"],
      },
    ],
    routes: [
      { id: "single", pattern: "/[...slug]", prerender: true, owner: "host" },
    ],
  });
}
```

Select `projects()` in `moo({ plugins: [...] })`, select its bound taxonomies,
and declare the native `project` collection using `entrySchema` extended with
the matching references and `glob({ generateId: sourceEntryId, ... })`. For an
English-default host, implement `pages/project/[...slug].astro` and
`pages/de/projekt/[...slug].astro`. A German-default host instead uses
`pages/projekt/[...slug].astro` and `pages/en/project/[...slug].astro`. Derive
each published Single path with `getEntryHref("project", entry)` and select its
route locale with `getRouteLocale(routePattern)`; render with the public generic
Single and one host Layout. The complete compiled recipe is in
`tests/fixtures/project-routes/`.

`slug: test-project` produces `/project/test-project`; its German translation
can use `slug: test-projekt` for `/de/projekt/test-projekt` in the
English-default configuration. Stable source IDs and `translationKey` connect
the translations. Adding several category/tag references leaves both Single
addresses unchanged. The CPT definition owns its prefix; taxonomy archive
prefixes describe separate lists. Changing either prefix requires site-owned
redirects for previously published URLs.

### Optional shared taxonomies

Select taxonomies explicitly in `moo({ plugins, taxonomies })`; the default is
`[]`. `defineTaxonomy` from `@wpmoo/astro/taxonomies` creates a pure, owned
descriptor. A definition has a stable lowercase kebab `id`, plain `label`,
local `source: URL`, optional `sourceKind: "json" | "json-directory"`,
`hierarchical`, and
`archive: false | { include?: "direct" | "descendants", basePath?: string }`.
Archives are disabled by default; descendants requires hierarchy.

```js
import { defineTaxonomy } from "@wpmoo/astro/taxonomies";

export const taxonomies = [
  defineTaxonomy({
    id: "category",
    label: "Categories",
    source: new URL("./data/category.json", import.meta.url),
    hierarchical: true,
    archive: { include: "descendants" },
  }),
];
```

The host declares the same native collection using Astro's `file()` loader
and the public `termSchema` from `@wpmoo/astro/taxonomies/content`. Its source
is a JSON array of `{ id, name, slug, description?, parent? }`. Directory mode
uses native `glob({ base, pattern: "*.json", generateId: jsonEntryId })` and
one record per exact `<id>.json` file. IDs remain stable when names or slugs
change. See `apps/demo/definitions.js` and `apps/demo/content.config.ts` for both recipes.

Bind the definition with `page({ taxonomies: ["category"] })`, `post(...)`,
or a custom plugin's content type. Extend the host's static schema with only
those bound keys, using native references:

```ts
pageSchema.extend({
  taxonomies: z
    .object({
      category: z.array(reference("category")).default([]),
    })
    .strict()
    .optional(),
});
```

Authored Markdown uses `taxonomies: { category: [guides] }`. The integration
validates every selected term and every content status, even with no archive
or query. Missing/duplicate IDs, converted slug collisions, invalid parents,
cycles, wrong/unbound/duplicate references and source/data mismatches fail.
The checks read native public collection data; no replacement loader or private
Astro store is used. During development, active content supplies a default
`vite.server.watch.awaitWriteFinish` of 100ms stability with 20ms polling.
This lets native loaders read the completed save when an editor saves and
formats a file in quick succession. Explicit host `awaitWriteFinish` settings
and `watch: null` remain host-owned. Disabling this stabilization can let the
native watcher's change coalescing miss a final write; integrity validation
then blocks requests until native content is current. Invalid source remains
fatal, and a cold build is the authoritative release check.

Server-only `@wpmoo/astro/taxonomies/queries` exports `getTaxonomyTerms(id)`,
`getTermEntries(id, termId, { include, locale }?)`, and
`getTaxonomyPaths({ taxonomies, routePattern, locale }?)`.
Items contain published Page/Post/custom-type summaries, canonical Single
hrefs, owned direct membership context and optional copied publication dates.
Ordering is type ID then exact entry ID; descendant matches deduplicate each
entry. Source locations and full entries are not exposed.

Without an explicit prefix, enabled archives retain the shared
`/topics/[taxonomy]/[slug]` route and optional root `taxonomyBasePath` setting.
Each taxonomy can instead choose its complete prefix through
`archive.basePath`. The rule is identical for category, tag and a later custom
taxonomy:

| `archive.basePath`  | Term slug `layouts`                     | Native producer             |
| ------------------- | --------------------------------------- | --------------------------- |
| omitted             | `/topics/category/layouts` for category | `/topics/[taxonomy]/[slug]` |
| `"/category"`       | `/category/layouts`                     | `/category/[slug]`          |
| `"/c"`              | `/c/layouts`                            | `/c/[slug]`                 |
| `"/"`               | `/layouts`                              | `/[...slug]`                |
| `"/library/topics"` | `/library/topics/layouts`               | `/library/topics/[slug]`    |

Explicit prefixes are canonical literal paths, without query, fragment or
dynamic segments. One terminal slash is normalized away except for `/`.
They are independent of the host's `base`, native locale prefixes and
trailing-slash policy. A localized
`locales.<locale>.basePath` replaces the whole prefix:

```js
defineTaxonomy({
  id: "category",
  label: "Categories",
  source: new URL("./data/category.json", import.meta.url),
  hierarchical: true,
  archive: { include: "descendants", basePath: "/category" },
  locales: { de: { label: "Kategorien", basePath: "/kategorie" } },
});
```

A stable term ID `guides` can have `slug: guides` and
`locales: { de: { name: "Anleitungen", slug: "anleitungen" } }`. With German
as the main language, this example produces `/kategorie/anleitungen` and
`/en/category/guides`. The same fields support a flat German archive and an
English `/c` archive. Existing `locales.<locale>.slug` remains the segment
under the legacy `taxonomyBasePath`; it cannot be combined with an effective
explicit `basePath`. Missing localized term fields inherit their base fields;
term IDs, parents and content references remain stable.

By default the integration owns one producer per distinct archive pattern.
They compose the existing Layout/includes/Archive/Loop and resolve
`site.types[taxonomyId].views.archive`. There is no taxonomy
index, pagination or automatic navigation. Breadcrumb ancestors link to actual
term routes; the current item includes the taxonomy label because Moo
Breadcrumb has no plain intermediate-item contract. To compose archives in a
theme Layout, select root `taxonomyRoutes: { archive: "host" }` and supply each
matching native prerendered route using
`getTaxonomyPaths({ routePattern, locale: getRouteLocale(routePattern) })`.
The selector names the actual native route, including its locale prefix; the
returned `params.taxonomy` exists only for the legacy shared pattern.
Retain each
taxonomy's enabled `archive` metadata and membership policy. Ownership applies
to the shared pattern and its native locale projections; missing, duplicate,
nonproject or nonprerendered host routes fail validation. Omitting this option
preserves plugin ownership. Term URLs follow the canonical site language,
independent of display-language preferences.

#### Flat archives and the shared Page route

Several taxonomies may use `/` together. Built-in Pages and those flat terms
then share exactly one `/[...slug]` producer per locale. All participants must
select the same ownership: injected by the package, or host-owned. A host
selects both `page({ routes: { single: "host" } })` and
`taxonomyRoutes: { archive: "host" }`, then uses the public context helper:

```astro
---
import type { GetStaticPathsOptions } from "astro";
import { getRootPaths, type RootPath } from "@wpmoo/astro/context";
import { getRouteLocale } from "@wpmoo/astro/i18n";
import Page from "../views/Page.astro";
import Taxonomy from "../views/Taxonomy.astro";

export const prerender = true;
export function getStaticPaths({ routePattern }: GetStaticPathsOptions) {
  return getRootPaths({ locale: getRouteLocale(routePattern) });
}
type Props = RootPath["props"];
const props = Astro.props;
---

{props.kind === "page" ? <Page entry={props.entry} /> : <Taxonomy {...props} />}
```

These `Page` and `Taxonomy` imports are the site's compositions, each using
one Layout and the public Page/Archive views; private package compositions
are not importable. For a locale that has no root group, retain its ordinary
Page route and selected nonroot archive producers. A taxonomy-only root group
also works without enabling Page.

Canonical validation rejects Page/term collisions, collisions between
taxonomies after locale normalization, occupied plugin prefixes, reserved
paths and competing native owners. Root terms reserve their concrete URLs;
nonroot archives reserve their active namespace. The unused `/topics`
namespace is released when every archive chooses an explicit prefix. Builds
check every advertised public output, including host-owned routes in a
single-language site. One missing archive or Page output fails certification.

When adopting root archives, replace the old Page producer with this shared
dispatcher and remove competing native dynamic routes. Before changing
prefixes or the main language, retain old and new canonical URL inventories,
check collisions, and configure redirects in the site's deployment. The
package does not silently rewrite memberships, source IDs or published URLs,
and it creates no automatic redirects.

### Native JSON storage and integrity

A custom content type declares either `{ kind: "json", file: URL }` or
`{ kind: "json-directory", base: URL }`. The host collection must load that
same source with a static schema. For example, two alternative `sample`
collection loaders are:

```ts
import { defineCollection } from "astro:content";
import { file, glob } from "astro/loaders";
import { z } from "astro/zod";
import { entrySchema, jsonEntryId } from "@wpmoo/astro/content";

const sampleSchema = entrySchema.extend({
  id: z.string().min(1),
  body: z.string(),
});

// Select one loader, matching the plugin's declared source.
const arrayCollection = defineCollection({
  loader: file("src/data/sample.json"),
  schema: sampleSchema,
});
const directoryCollection = defineCollection({
  loader: glob({
    base: new URL("./data/sample/", import.meta.url),
    pattern: "*.json",
    generateId: jsonEntryId,
  }),
  schema: sampleSchema,
});
export const collections = { sample: directoryCollection };
```

Array storage keeps all records in one authoritative file and preserves
existing nonempty string IDs such as `cng_1`; the host schema may constrain them.
Directory storage
keeps one object in each exact `<id>.json` file; `jsonEntryId` returns the
authored lowercase kebab ID. Nested directories, hidden JSON candidates,
incorrect filename casing, ID/filename mismatches, missing sources and
malformed JSON fail validation. An existing empty directory is valid. Term
arrays use `termSchema`; term directories use the same `jsonEntryId` loader
with `termSchema` and `sourceKind: "json-directory"` in their descriptor.

Changing storage is an explicit migration. Before writing directory files,
check every ID and filename, duplicate, reference, parent, locale association
and canonical URL against the original array. If an ID cannot satisfy the
directory rule, retain the original array and resolve that migration first;
never silently rename IDs or slugify them. Update the source descriptor and
native loader together, verify unchanged IDs/references/URLs, then remove the
old authority. The package performs no automatic storage conversion.

Validation covers every selected source and status, including content that
has no public query or archive. A private prerendered integrity route validates
the active collections and returns zero paths. It emits no public endpoint or
page in a successful build. Missing/incorrect native entries, malformed current
source, schema failures, invalid references and URL/graph conflicts fail the
build; development middleware also rejects stale invalid source before serving
a request. Valid source recovers once the native collection has synchronized.
No custom content loader, private Astro store or substitute parser is installed.

### CMS-free authoring and future editor adapters

The package runs without an editor, database, authentication or admin route.
Authored Markdown and JSON remain the content authority. MDX and native Astro
files are trusted code and remain read-only to a future content-only editor
unless that editor's code handling is separately certified.

A theme can extend its static schema with an ordered `sections` array. Each
item has a stable instance `id`, a host-declared `type` and validated `props`:

```yaml
sections:
  - id: introduction
    type: text
    props:
      heading: Welcome
      text: Ordinary editable content.
  - id: contact-action
    type: action
    props:
      label: Contact us
      href: /contact
```

The host declares the finite discriminated schema, rejects duplicate instance
IDs and unsafe values, and maps the same type keys to explicitly imported
Astro components. Keep pure labels/field metadata separate from `.astro`
imports so a future editor can consume data without loading server components.
The `content-editing` consumer proves this storage/rendering contract with
ordinary Markdown and JSON. The package supplies no section library or generic
Zod-to-form converter.

No CMS has been selected, installed or certified by this package. An adapter
must use the editor's public extension points for whole-field values and
stable file keys. Examples of candidates are Keystatic's root-public
`BasicFormField`/`SlugFormField` contracts and Decap's typed list plus custom
widget contracts; these are integration candidates, not tested panels.
Selecting another editor requires equivalent evidence.

Before advertising an adapter, retain actual panel round trips proving:

- No-op save preserves authored missing fields, `false`, `null`, stable IDs,
  references and URLs without serializing resolved theme defaults.
- Add, reorder, edit, save and reload preserve section IDs, type keys and props;
  title/slug edits preserve the independent file key.
- Conditional revision writes reject stale edits, deletion and recreation;
  partial write failures recover without replacing the content authority.
- Invalid content can be repaired or restored. The first preview represents a
  saved published snapshot from the exact revision and a fresh successful
  Astro build. Unsaved/draft preview, media and a co-hosted admin runtime need
  their own certification.
- Removing the editor config and dependencies leaves the authored files,
  source IDs, canonical URLs and ordinary Astro build working unchanged.

A direct-file fixture or stock form control does not prove those panel,
concurrency or preview guarantees. There is no automatic WordPress import,
template discovery or CMS-specific permalink behavior.

## SEO from ordinary content

Configure the host's actual production `site` in `astro.config.mjs`. Built-in
Page, Post and taxonomy routes then resolve metadata from their published route
projection and ordinary content fields. Without `site`, the existing bare
Layout/title behavior remains valid; no localhost canonical or organization is
invented. Sitemap is a separate, optional host integration, never a core dependency.

```js
// astro.config.mjs (host configuration)
import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
import { post } from "@wpmoo/astro/plugins/post";

export default defineConfig({
  site: "https://example.com",
  integrations: [
    moo({
      site: {
        brand: "Visible site label",
        organization: {
          name: "Example Foundation",
          names: { de: "German foundation" },
        },
        seo: {
          titleTemplates: {
            home: "{organization.name}",
            default: "{title} | {organization.name}",
            types: { post: { single: "{title} — {organization.name}" } },
            locales: { de: { default: "{title} | {organization.name}" } },
          },
        },
      },
      plugins: [page(), post()],
    }),
  ],
});
```

Only `{title}` and `{organization.name}` placeholders are accepted. An explicit
brand is independent of the publisher; an omitted brand uses the registered
organization name, then the existing Moo UI fallback. Locale type/view templates
precede site type/view, locale default and site default. Home checks locale home,
site home, locale default and site default. Missing templates use the organization
name for Home and `title | organization.name` otherwise; with no organization,
only the ordinary title is used. An organization placeholder without a registered
organization fails with a field-specific error. Content headings remain unchanged.

A host-owned route or external CPT can use the same public resolver and head:

```astro
---
import Layout from "@wpmoo/astro/Layout.astro";
import Single from "@wpmoo/astro/views/Single.astro";
import { getSiteContext } from "@wpmoo/astro/context";
import { resolveSeoMetadata } from "@wpmoo/astro/seo";
const metadata = Astro.site
  ? resolveSeoMetadata(getSiteContext().site, {
      title: "Team",
      status: "publish",
      type: "team",
      view: "native",
      url: new URL(Astro.url.pathname, Astro.site).href,
    })
  : undefined;
---

<Layout title="Team" metadata={metadata}
  ><Single title="Team"><p>Team content.</p></Single></Layout
>
```

The resolver accepts the existing emitted absolute URL; it does not generate
slugs, add a base, infer a translation or change trailing slashes. Canonicals
reject credentials, non-HTTP(S) schemes, query strings and fragments. Only
`publish` returns metadata; draft/pending/future return `null` after input
validation. Scheduling and public route visibility remain the content owner's
responsibility. Passing `null` does not unpublish an independently authored host route.

Layout owns the single title/description/canonical, Open Graph/Twitter tags and
script-safe JSON-LD. Text is escaped once by Astro; JSON-LD is structured data,
never `trustedHtml`. A Post Single uses BlogPosting with its real `published_at`;
Page, archive and external CPT defaults use WebPage. Authored creation/update
dates are optional and never inferred from file/build/deployment times. Missing
description, image, author or registered publisher remains missing. The public
resolver can accept an actual absolute image URL and one Person author record
`{ name, url? }` supplied by a host/content-type schema; it does not resolve author
references or add those fields to every built-in schema. SEO frontmatter is not added.

The approved public-hook preflight certifies `@astrojs/sitemap@3.7.4` with Astro
`7.3.3`. A host places its validated emitted/published URL projection hook before
the official writer, filters its candidates and supplies canonical `url`,
translation `links` and authored `lastmod` via public async `serialize`. Do not use
prefix matching as evidence of translated slugs or infer existing translations
from Astro URL helpers. Under `base: "/docs"` and `trailingSlash: "ignore"`, the
writer's Home candidate can omit the mount slash; its serializer must retain the
actual projected canonical. Parse the generated XML: the official writer catches
serializer errors and a successful build exit does not prove sitemap output.
The host can obtain content alternatives from `getLanguageLinks()` and term
alternatives from `getTaxonomyPaths()`. Project those records in its build
before the optional Sitemap integration runs; verify every advertised URL
against actual output. The package does not install or configure Sitemap.
The independent consumer matrix covers the implemented foundation. SEO and native
locale checks additionally exercise their own compiled fixtures; broader
version support and final release acceptance remain separate gates.

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

<Layout title={copy.title} lang={lang} skipText={copy.skipToContent}>
  <h1>{copy.title}</h1>
  <Loop items={items} emptyText={copy.emptyItems} />
</Layout>
```

The repository-only `/preview/i18n-empty` route demonstrates this with English defaults, an explicit German translation probe and the generic/Page Loop empty-state props. The existing English defaults are fallbacks for callers that do not supply copy; multilingual themes should always supply it.

### Native static content locales

Astro's `i18n` config owns the enabled locales, default locale and prefix policy.
Do not enable it merely to use a single-language site. The public server helpers
also work in an active single-language content host: `getRouteLocale()` returns
`site.defaults.lang`, `getLocaleHref()` preserves the existing base/slash policy,
and `getLanguageLinks()` returns no translation links for a standalone entry.
The integration loads `astro:i18n` only when native i18n is enabled.

The repository-only `/guide/setup` and `/de/einrichtung` demos share a
translation key and switch between actual authored URLs through the public Moo
DropdownMenu. English is the default; German content, navigation and language
controls demonstrate the translated locale. Demo files stay outside npm.

```js
import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
import { post } from "@wpmoo/astro/plugins/post";

const i18n = {
  locales: ["de", "en"],
  defaultLocale: "de",
  routing: { prefixDefaultLocale: false },
};

export default defineConfig({
  site: "https://example.test",
  i18n,
  integrations: [
    moo({
      site: {
        defaults: { lang: i18n.defaultLocale },
        locales: { de: { dir: "ltr" } },
      },
      plugins: [
        page(),
        post({ locales: { de: { label: "Articles", basePath: "/articles" } } }),
      ],
    }),
  ],
});
```

Every entry in an active multilingual collection declares its real `locale`.
An optional lowercase kebab `translationKey` groups same-type translations;
it is not a filename, slug or taxonomy ID. Both published and nonpublic entries
must have a unique `(type, translationKey, locale)`. `draft`, `pending` and
`future` entries never become public links. A `future` entry still needs an
explicit publication status transition and a rebuild when its date passes.

For example, `en/contact.md` can declare `slug: contact`, `locale: en`,
`translationKey: contact`; `de/contact.md` can declare `slug: kontakt`,
`locale: de`, `translationKey: contact`. Their URLs are `/en/contact` and
`/kontakt` under the config above. Filename-derived URLs strip a matching
locale directory, while the exact native source IDs remain `en/contact.md`
and `de/contact.md`.
Explicit slugs keep their authored path. JSON source IDs remain unchanged.

Multilingual Markdown and MDX content use the same directory structure for
every language, including the configured main language:

```text
content/
├── page/
│   ├── de/contact.md
│   └── en/contact.md
└── post/
    ├── de/announcement.md
    └── en/announcement.md
```

`i18n.defaultLocale` selects the main language; it is not tied to English.
With `prefixDefaultLocale: false`, only other languages receive URL prefixes.
The locale directory describes the content's actual language and stays in its
native source ID. Changing the main language changes which public URLs have
prefixes; it does not rename or relabel the content. Share that configured
value with `site.defaults.lang` as above. Existing sites must plan redirects
when changing their main language because canonical URLs change.

Astro's `pages/` directory is a route manifest, separate from the content
directories. For host-owned routes, the main language's route files stay at
the root of `pages/`, and other languages use locale subdirectories. Keep
these host route files aligned when changing the configured main language.
Plugin-owned routes apply the selected locale automatically. This follows
[Astro's native i18n routing](https://docs.astro.build/en/guides/internationalization/#prefixdefaultlocale-false).

`site.locales.<locale>` refines the shared site defaults before type/view/entry
options, including `parts`, `dir` and theme preferences. Route language must
agree with the entry locale; a contradictory `options.lang` fails. Display
labels and segments use `plugin.locales.<locale>.{label,basePath}` and
`taxonomy.locales.<locale>.{label,slug,basePath}`. Term records use partial
`locales.<locale>.{name,description,slug}` with base-field fallback; stable term
IDs and content membership do not change.

The public server module `@wpmoo/astro/i18n` exports:

- `getRouteLocale(routePattern)`: resolve the language from Astro's public route pattern.
- `getLocaleHref(path, locale)`: apply the native locale prefix to an already canonical unprefixed local path, retaining the host base/slash policy. It does not discover a translated slug.
- `getLanguageLinks(typeId, entry)`: return immutable `{ locale, href }` links to current published same-type translations, including self. A standalone entry returns `[]`; missing or nonpublic translations create no fallback target.

Use these from server frontmatter, `getStaticPaths()` or a server endpoint,
after registering the content integration. Host-owned translated Single routes
retain explicit route ownership and use the same queries, preferences and
canonical hrefs. The build rejects advertised published content without an
actual emitted route, including omitted host-owned translations. Built-in
Page/Post/term heads use the same URLs for canonical and reciprocal hreflang.

The initial active static profile supports canonical lowercase string locales,
unprefixed or all-prefixed defaults, root/subpath mounts and all three Astro
slash policies. Alias locale objects, manual routing, domains and automatic
fallback pages require further certification and fail explicitly. This is not
a second router or translation database. The existing ten-profile matrix
includes theme and MDX hosts; CMS interoperability, broader host versions and
the final release decision remain separate gates.

Published Moo UI 1.0.0 still writes English labels from its DataTable runtime (for example the live result summary and generated page controls) and DatePicker calendar runtime (navigation ARIA labels and preset names), even when a page language or date locale is supplied. Astro does not replace those scripts. A published Moo label configuration contract is needed before these interactive components can be certified for multilingual themes.

## Develop and verify

The private repository root shares package orchestration, EditorConfig,
TypeScript settings, scripts and tests. `packages/astro` owns the SDK manifest
and source. Its explicit file selection excludes apps and repository tooling.
`apps/demo` imports only public SDK entrypoints. `apps/consumer` retains an
independent template lock and installs a real archive outside the checkout.

```text
ui-astro/
├── packages/
│   ├── astro/
│   │   ├── src/          # Public source and required private transitives
│   │   ├── contracts/    # Closed surface and release provenance
│   │   └── package.json  # SDK dependencies, peers, exports and file selection
│   └── theme-pilot/      # Private reference presentation theme
├── apps/
│   ├── demo/             # Development workspace, authored content and config
│   ├── consumer/         # Independent tarball template, outside workspaces
│   └── theme-pilot/      # Independent multilingual theme site
├── scripts/              # Shared nonpacked verification tools
├── tests/                # Nonpacked unit/native tests and other profiles
├── .editorconfig         # Portable shared formatting policy
├── tsconfig.json         # Shared strict module and source checking
└── package-lock.json     # Single development workspace lock
```

Use Node.js `>=22.12.0`. From the Astro repository root:

```bash
npm ci
npm run dev
```

The demo opens on `http://localhost:4322`. Root commands forward additional
arguments to the demo. Shared EditorConfig and TypeScript settings live here.
The root and demo are private npm workspaces; `apps/consumer` and
`apps/theme-pilot` remain outside workspace membership with their own locks.

To create a local SDK archive from the same repository root:

```bash
npm run pack:astro
```

The demo's Astro config uses `srcDir: "./"` from `apps/demo`. Existing root
npm/Make commands forward to that host; SDK export targets remain relative to
its own `src/`. Root development tools and the demo's opt-in MDX integration
are outside SDK runtime dependencies. Other sealed profiles keep their locks.

The npm archive contains the public adapter source, its private transitive
helpers and injected routes, declarations, the CSS/runtime facades, the
closed export/file ledger, immutable release provenance, the package README,
`COMPATIBILITY.md` and the package's MIT `LICENSE`. `THIRD_PARTY_NOTICES.md`
stays in the repository; package READMEs link to dependency licenses, and
embedded icon notices remain beside their geometry in the source. Demo pages,
example Markdown, host content
configuration, tests, development scripts, caches and built demo output are
not shipped. Packed private helpers remain inaccessible as package subpaths.

Sidebar menu links keep explicit accessible names when the published icon
collapse hides their visual text. Each name defaults to its item `title`;
an explicit nonempty `ariaLabel` can replace it. The brand link uses `brand`.
The embedded `file-text` and `layout-grid` geometry follows the published icon
registry. That registry is not a public npm export; the adapter does not read
a sibling checkout at runtime or provide the entire Lucide catalog.

Sidebar items can supply a nonempty `children` array of links instead of an
`href`. The parent becomes the published submenu disclosure with a unique
target derived from the Sidebar ID and item position. `open` overrides the
initial state; when omitted, a submenu opens if it contains an active link.
Submenus support one level, preserve link labels and disabled states, and use
Bootstrap Collapse plus Moo's icon-rail flyout. The include accepts the same
item contract and defaults `railAriaLabel` to `parts.header.toggleLabel`.
Neither the adapter nor the demo adds a navigation controller
or custom CSS. The demo groups its examples into these collapsible sections.

Accessible `parts.header` labels and Layout's direct `ariaLabel` require
nonempty plain text. Empty-state copy can still be explicitly empty.

The source integrity gate parses current Markdown frontmatter through the
certified Astro host's public `astro/markdown` export, validates it with the
declared static schema and compares normalized data and retained body with
the native entry. Use the native `glob` default `retainBody: true`. Invalid
warm edits fail every development request even if Astro's watcher retains
the last valid record; valid edits recover after the native collection syncs.
This adds no replacement loader, private Astro import or parser dependency.

From the workspace root, `make ui-astro` serves the local demonstration on port 4322. Development asset sync has separate provenance; it does not change the
tracked release pin and never substitutes for the published 1.0.0 release.

For an Astro-only development asset update, use `make ui-astro-sync MODE=dev UI_PACKAGE_TARBALL=/absolute/path/to/ui.tgz`. The native npm install keeps lockfile resolution enabled and uses `--no-save` so unrelated locked dependencies and tracked release inputs stay unchanged. A local correction candidate may intentionally differ from 1.0.0's recorded CSS bytes; the release artifact guard must reject it. Restore the published package with `npm ci` for release checks.

The `moo()` integration separates the default build and sync Vite caches from the development cache, so these commands can run while the existing development server stays open. An explicit host `vite.cacheDir` remains unchanged; a host choosing its own cache must keep concurrent commands isolated. After a runtime upgrade, reload the browser to request the current modules. The live regression `python3 tests/test_dev_runtime_build.py` uses the existing 4322 server and checks that a build preserves public runtime responses and selected Page/Post routes.

From the repository root:

```bash
npm test
npm run check
npm run build
npm pack --workspace @wpmoo/astro --dry-run
node scripts/sync_package_baseline.mjs --check-release
node scripts/verify_astro_boundary.mjs --mode release
python3 tests/test_page_collection.py -v
python3 tests/test_visual_acceptance.py -v
python3 tests/test_shared_parts_acceptance.py -v
```

The visual test needs Python Playwright with Chromium and the existing server on port 4322; `ASTRO_BASE_URL` can point it at the same accepted surface in a packed consumer. Development layout provenance is checked separately with `node scripts/verify_astro_boundary.mjs --mode dev` against the reviewed `projects/ui/html` commit. `packages/astro/contracts/layout-surface.snapshot.json` is an integration snapshot, not a packed release file.

For an independent install, prime an isolated npm cache from the reviewed
consumer lockfiles and the current package archives. Select an existing local
Node image, then run the controller from the repository root:

```bash
node scripts/verify_packed_consumer.mjs \
  --fixture all \
  --cache /absolute/primed-cache \
  --output /absolute/empty-proof \
  --image existing-local-image
```

The controller packs one main archive and a separate external plugin archive.
It prepares authored consumers for the selected profiles, then creates an inspected container with
networking disabled, a read-only image filesystem, no published ports and only
the prepared proof root plus a read-only cache mount. No source checkout,
sibling HTML repository or installed dependency tree is mounted. It never
pulls a runtime image implicitly.

Each consumer runs strict `npm ci --offline --strict-peer-deps`, a real Astro
type check and a build. The matrix covers default, theme, UI-only, Page-only,
Post-only, optional MDX, external plugin, taxonomy, external taxonomy and
CMS-free content editing, built-in 404 and host-owned 404. Consumers check their
public imports and reject recorded private subpaths; only the MDX profile
installs that integration. The main archive includes `COMPATIBILITY.md` and its
closed surface ledger; the external fixture carries its own export map.

Schema-v2 proof retains the actual archives, locks, installed files, authored
sources, logs, loaded source paths, compiled namespaces/content and container
inspection. The independent workspace verifier compares these with its own
reviewed records; a child success flag is insufficient. Focused `--fixture`
runs are local checks, not release certification. Run
`python3 tests/test_packed_matrix.py /absolute/proof -v` for the retained matrix
and `python3 tests/test_packed_runtime.py /absolute/proof/consumer/dist -v` for
the primary built page in Chromium without a server. See
[COMPATIBILITY.md](../packages/astro/COMPATIBILITY.md) for verified runtime scope and remaining
release gates.

The exact public exports and packed files are recorded in `packages/astro/contracts/astro-public-surface.json`. The published Core export targets and hashes are recorded in `packages/astro/contracts/ui-1.0.0-package.json`. The release gate checks the registry lock, installed Core bytes, archive closure, and public export map without reading the sibling HTML checkout or using the network.

## Reference theme and pilot

The private MIT package in `packages/theme-starter` composes the public SDK
and uses exact SDK/Astro peers. The independent
[pilot site](../apps/theme-pilot/README.md) owns content, routes and locale
settings; it installs versioned archives with its own manifest and lock.

Resolve the theme's `defaultPreferences` through the SDK's `defineSite` and
`resolvePageOptions`, then pass prepared data into its `Layout` and Page,
Post, Archive or NotFound views. `sections/Action.astro` accepts `label`,
`href` and public Button choices as data, including from MDX. The theme owns
no collections, routes or runtime.

The sealed pilot proof checks six locale/URL profiles and rehearses a theme
update and exact rollback. From the Astro repository root:

```bash
npm run verify:theme-pilot -- \
  --cache /absolute/primed-cache \
  --output /absolute/empty-proof \
  --image "sha256:<existing-image-id>"
```

Supply an absolute primed cache, an empty output outside the checkout and the
ID of an existing immutable Node image. Archives stay versioned under ignored
`artifacts/theme-starter/`; authored site files remain unchanged during updates.
This proof certifies the archives selected by the pilot's manifest and lock.
Source changes do not replace its installed archives. Publication remains a
separate release decision.

## Upgrade a theme or plugin

Keep the application's tested package, Astro, optional integrations and lockfile
explicit. Read [COMPATIBILITY.md](../packages/astro/COMPATIBILITY.md) before updating them. Check
the application's old content/configuration first, then adopt new options
deliberately and inspect its rendered result. A dependency update does not
activate a new feature, migrate content, rename URLs or deploy the site.

## Definition-owned custom content URLs

The content type definition owns its permalink prefix. Taxonomy memberships
never become part of a Page, Post or custom content permalink. A host factory
can define Projects with translated prefixes using the existing plugin API:

```js
import { definePlugin } from "@wpmoo/astro/plugins";

export function projects() {
  return definePlugin({
    apiVersion: 1,
    id: "projects",
    label: "Projects",
    basePath: "/project",
    locales: { de: { label: "Projekte", basePath: "/projekt" } },
    contentTypes: [
      {
        id: "project",
        collection: "project",
        singleRoute: "single",
        source: {
          kind: "markdown",
          formats: ["md"],
          base: new URL("./content/project/", import.meta.url),
        },
        taxonomies: ["category", "tag"],
      },
    ],
    routes: [
      { id: "single", pattern: "/[...slug]", prerender: true, owner: "host" },
    ],
  });
}
```

The native host routes `src/pages/project/[...slug].astro` and
`src/pages/de/projekt/[...slug].astro` use the actual `routePattern` to select
`getRouteLocale(routePattern)`. They obtain canonical links from
`getEntryHref("project", entry)` and strip the locale-aware prefix produced by
`getLocaleHref()` to obtain the rest parameter. The packed consumer recipe in
`tests/fixtures/project-routes` includes the native loader, schema, shared
single Layout, translated content, SEO alternates and both route files.

An English entry slug `test-project` has `/project/test-project`; its German
translation with the same `translationKey` and slug `test-projekt` has
`/de/projekt/test-projekt`. Source IDs such as `en/test.md` remain unchanged.
A host base and trailing-slash policy apply once to these canonical URLs.
