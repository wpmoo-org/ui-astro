# Moo UI Astro adapter

`@wpmoo/astro` composes Astro pages from the published `@wpmoo/ui@1.0.0-rc.9` CSS, state script, and ESM components. Its package has 45 public component wrappers, one Layout, four shared includes, three generic views, pure configuration and plugin-descriptor entrypoints, Page/Post descriptors, schemas, native queries and specialized views, and three CSS/runtime entrypoints. The demonstration routes stay in this repository and are not packed.

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

The current RC9 `contained` shell forces its Sidebar into document flow below 992 px. The long-navigation mobile example is rejected and is not an accepted regression baseline. Correct mobile drawer behavior requires a Moo Core contract correction; the adapter does not override the published CSS or substitute a controller. Desktop containment and the `viewport` mobile drawer are separate verified behaviors.

The Page main rail exposes `data-page-container`. Bootstrap rows can opt into Moo's available-width grid with `data-layout="page-grid"`, a base `col-N` on each direct item, and registered `data-page-col-lg`, `data-page-show-from`, or `data-page-hide-from` attributes. The published CSS handles the expanded, collapsed, overlay, and absent Sidebar states. The local `demo/pages/index.astro` demonstrates this composition; it is not part of the package.

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
  document
    .querySelectorAll(".chart")
    .forEach((root) => Chart.getOrCreateInstance(root));
</script>
```

The Bootstrap facade exposes the installed Bootstrap ESM namespace to the published Moo Sidebar runtime. The Moo facade re-exports the published Core ESM module; its optional components are initialized on caller-owned roots. Layout already loads both facades and initializes its own Sidebar. Its declaration covers the shared `getInstance`, `getOrCreateInstance`, construction and disposal lifecycle of the nine RC9 constructors; it does not advertise additional component-specific methods.

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

The public `UtilityToken` type enumerates registered spacing (0–5 and responsive breakpoints), display/flex/alignment, text/background/link color, weight, border and rounded helpers. Custom classes, CSS values, HTML and file paths are rejected. PageHeader has narrower typed bounds because published Moo Typography owns some styles: `page-title` fixes `fw-semibold`; both description variants fix `text-body-secondary`; `page-description` fixes `mb-0`. Incompatible title weight, description color and nonzero bottom-margin utilities fail with their `parts.pageHeader` field. Responsive `m`/`my` utilities that change that bottom margin also fail. Alignment, title margins and description top margins remain configurable. An explicit `descriptionVariant: 'muted'` permits other description margins; repeat that variant in a layer that supplies them. Switching back to `page-description` also validates inherited utilities. RC9 has no public prop to replace the fixed weight/color mappings; this Core capability gap is retained instead of accepting an ineffective override.

Public Typography semantic roles remain unchanged. Full content-region replacement uses the existing `page-header`, `metadata`, `actions`, `loop`, `after-list` and `after-content` slots. This setting does not add a stylesheet or replace a Moo controller.

`formatDate(date, { lang, style, formatter? })` returns display text. Named styles use `Intl.DateTimeFormat` with UTC; `iso` returns `YYYY-MM-DD`. Generic Archive/Loop and Post Single accept display `lang` and a trusted caller `dateFormatter` function. Specialized Page/Post Archive and Loop retain `lang` for canonical URL normalization and add `dateLang` for display (default: `lang`). Built-in Post Archive passes the site's canonical default language to link generation and the resolved Archive language to date display. A view/entry display preference does not change generated route identity. The function receives a Date copy and must return text; Astro escapes that text. The original ISO `datetime`, publication instant and status remain unchanged. Functions are caller code, never frontmatter. Explicit legacy `emptyText`, `titleVariant`, ARIA text or date formatter props take precedence over the corresponding part fallback.

This unpublished candidate adds `parts` to normalized output and changes the default outer content spacing from zero to `py-4`. Existing authored fields retain their meaning. The maintainer accepted the configurable spacing foundation on 2026-10-01; positive browser contracts cover inherited Layout spacing, a Contact-only override and independent heading/item gaps. This acceptance does not certify a finished theme design or release compatibility.

`@wpmoo/astro/plugins` exports `definePlugin`. Its versioned descriptor records a content type, declared local source, Single route ownership, and optional navigation as validated immutable data. Defining a plugin performs no file load, content query, route injection, or UI initialization. The root `moo()` integration activates the supplied descriptors. Omitting `plugins` selects `page()` plus `post()` and requires both native collections. An explicit list replaces the defaults: `[page()]` needs only Page, `[post()]` needs only Post, and `[]` adds no content routes or collection requirements. `page({ routes: { single: "host" } })` makes the host supply its own `src/pages/[...slug].astro` using the public query and view helpers. The local demo uses this documented boundary to compose its example Sidebar; demo files stay outside the package.

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

Page frontmatter requires `title` and `status: publish|draft|pending|future`; `slug`, three authored dates, navigation labels/order, and `options` preferences are optional. Source IDs retain their exact relative `.md` or `.mdx` filenames. The slug controls only the URL. Only published Pages appear in the query results and paths; scheduled Pages reserve their canonical URL. The integration validates source identity and data before rendering. Taxonomy, SEO and native multilingual routing remain implementation tasks.

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

String props are escaped by default. `trustedHtml` is only for trusted, caller-owned markup. Do not enable it for user or remote content.

### Optional shared taxonomies

Select taxonomies explicitly in `moo({ plugins, taxonomies })`; the default is
`[]`. `defineTaxonomy` from `@wpmoo/astro/taxonomies` creates a pure, owned
descriptor. A definition has a stable lowercase kebab `id`, plain `label`,
local `source: URL`, optional `sourceKind: "json" | "json-directory"`,
`hierarchical`, and `archive: false | { include: "direct" | "descendants" }`.
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
change. See `demo/definitions.js` and `demo/content.config.ts` for both recipes.

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
Astro store is used. A rapid save suppressed by the native file watcher remains
blocked by integrity validation until native content is current; a cold build
is the authoritative release check.

Server-only `@wpmoo/astro/taxonomies/queries` exports `getTaxonomyTerms(id)`,
`getTermEntries(id, termId, { include }?)`, and `getTaxonomyPaths({ taxonomies }?)`.
Items contain published Page/Post/custom-type summaries, canonical Single
hrefs, owned direct membership context and optional copied publication dates.
Ordering is type ID then exact entry ID; descendant matches deduplicate each
entry. Source locations and full entries are not exposed.

Enabled archives share one `/topics/[taxonomy]/[slug]` route, with an optional
canonical `taxonomyBasePath`. They compose the existing Layout/includes/Archive/
Loop and resolve `site.types[taxonomyId].views.archive`. There is no taxonomy
index, pagination or automatic navigation. Breadcrumb ancestors link to actual
term routes; the current item includes the taxonomy label because Moo
Breadcrumb has no plain intermediate-item contract. A host replacement disables
default archives and explicitly requests its selected paths. Term URLs follow
the canonical site language, independent of display-language preferences.

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
The full independent active-feature consumer matrix remains a separate gate.

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

The repository-only `/guide/setup` and `/en-gb/getting-started` demos share a
translation key and switch between actual authored URLs through the public Moo
DropdownMenu. Both examples use English copy; demo files stay outside npm.

```js
import { defineConfig } from "astro/config";
import moo from "@wpmoo/astro";
import { page } from "@wpmoo/astro/plugins/page";
import { post } from "@wpmoo/astro/plugins/post";

export default defineConfig({
  site: "https://example.test",
  i18n: {
    locales: ["en", "de"],
    defaultLocale: "en",
    routing: { prefixDefaultLocale: false },
  },
  integrations: [
    moo({
      site: { defaults: { lang: "en" }, locales: { de: { dir: "ltr" } } },
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
`locale: de`, `translationKey: contact`. Their URLs are `/contact` and
`/de/kontakt` under the config above. Filename-derived URLs strip a matching
locale directory, while the exact native source ID remains `de/contact.md`.
Explicit slugs keep their authored path. JSON source IDs remain unchanged.

`site.locales.<locale>` refines the shared site defaults before type/view/entry
options, including `parts`, `dir` and theme preferences. Route language must
agree with the entry locale; a contradictory `options.lang` fails. Display
labels and segments use `plugin.locales.<locale>.{label,basePath}` and
`taxonomy.locales.<locale>.{label,slug}`. Term records use partial
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
a second router or translation database. The broader theme/MDX/CMS/version
matrix and final release decision remain pending.

Published Moo UI RC9 still writes English labels from its DataTable runtime (for example the live result summary and generated page controls) and DatePicker calendar runtime (navigation ARIA labels and preset names), even when a page language or date locale is supplied. Astro does not replace those scripts. A published Moo label configuration contract is needed before these interactive components can be certified for multilingual themes.

## Develop and verify

This repository maintains one npm package. `src/` contains its product source;
the closed `package.json` file list also selects the README, licenses and
contract records. `demo/` is a separate example host that imports the public
`@wpmoo/astro` entrypoints. Demo routes, content, configuration and helpers are
excluded from the npm archive.

```text
ui-astro/
├── src/                  # Published source and required private transitives
├── demo/
│   ├── content.config.ts # Native example collections
│   ├── content/          # Authored Page and Post Markdown
│   ├── layouts/          # Host composition using public includes and Layout
│   ├── pages/            # Example routes and preview endpoints
│   └── *.js              # Host navigation, copy and settings
├── contracts/            # Closed exports/files and immutable RC9 provenance
├── scripts/              # Nonpacked verification tools
└── tests/                # Nonpacked unit, native and consumer fixtures
```

The root Astro config uses `srcDir: "./demo"`. Existing npm/Make commands run
this host; package export paths remain under `src/`. Consumer fixtures keep
their own source directories and install the packed package independently.

The npm archive contains the public adapter source, its private transitive
helpers and injected routes, declarations, the CSS/runtime facades, the
closed export/file ledger, immutable RC9 provenance, this README,
`COMPATIBILITY.md`, `LICENSE`
and `THIRD_PARTY_NOTICES.md`. Demo pages, example Markdown, host content
configuration, tests, development scripts, caches and built demo output are
not shipped. Packed private helpers remain inaccessible as package subpaths.

Sidebar menu links keep explicit accessible names when the published icon
collapse hides their visual text. Each name defaults to its item `title`;
an explicit nonempty `ariaLabel` can replace it. The brand link uses `brand`.
The embedded `file-text` and `layout-grid` geometry follows the RC9 icon
registry. That registry is not a public npm export; the adapter does not read
a sibling checkout at runtime or provide the entire Lucide catalog.

Accessible `parts.header` labels and Layout's direct `ariaLabel` require
nonempty plain text. Empty-state copy can still be explicitly empty.

The source integrity gate parses current Markdown frontmatter through the
certified Astro host's public `astro/markdown` export, validates it with the
declared static schema and compares normalized data and retained body with
the native entry. Use the native `glob` default `retainBody: true`. Invalid
warm edits fail every development request even if Astro's watcher retains
the last valid record; valid edits recover after the native collection syncs.
This adds no replacement loader, private Astro import or parser dependency.

From the workspace root, `make ui-astro` serves the local demonstration on port 4322. `make sync` follows the HTML `dev` branch for local integration and leaves the release pin in `package.json` and `package-lock.json` intact. Do not treat the local development package as the published RC9 release.

For an Astro-only development asset update, use `make ui-astro-sync MODE=dev UI_PACKAGE_TARBALL=/absolute/path/to/ui.tgz`. The native npm install keeps lockfile resolution enabled and uses `--no-save` so unrelated locked dependencies and tracked release inputs stay unchanged. A local correction candidate may intentionally differ from RC9's recorded CSS bytes; the release artifact guard must reject it. Restore the published package with `npm ci` for release checks.

The `moo()` integration separates the default build and sync Vite caches from the development cache, so these commands can run while the existing development server stays open. An explicit host `vite.cacheDir` remains unchanged; a host choosing its own cache must keep concurrent commands isolated. After a runtime upgrade, reload the browser to request the current modules. The live regression `python3 tests/test_dev_runtime_build.py` uses the existing 4322 server and checks that a build preserves public runtime responses and selected Page/Post routes.

From this package directory:

```bash
npm test
npm run check
npm run build
npm pack --dry-run
node scripts/sync_package_baseline.mjs --check-release
node scripts/verify_astro_boundary.mjs --mode release
python3 tests/test_page_collection.py -v
python3 tests/test_visual_acceptance.py -v
python3 tests/test_shared_parts_acceptance.py -v
```

The visual test needs Python Playwright with Chromium and the existing server on port 4322; `ASTRO_BASE_URL` can point it at the same accepted surface in a packed consumer. Development layout provenance is checked separately with `node scripts/verify_astro_boundary.mjs --mode dev` against the reviewed `projects/ui/html` commit. `contracts/layout-surface.snapshot.json` is an integration snapshot, not a packed release file.

For an independent install, prime an isolated npm cache from the reviewed
consumer lockfiles and the current package archives. Select an existing local
Node image, then run the controller from this package directory:

```bash
node scripts/verify_packed_consumer.mjs \
  --fixture all \
  --cache /absolute/primed-cache \
  --output /absolute/empty-proof \
  --image existing-local-image
```

The controller packs one main archive and a separate external plugin archive.
It prepares ten authored consumers, then creates an inspected container with
networking disabled, a read-only image filesystem, no published ports and only
the prepared proof root plus a read-only cache mount. No source checkout,
sibling HTML repository or installed dependency tree is mounted. It never
pulls a runtime image implicitly.

Each consumer runs strict `npm ci --offline --strict-peer-deps`, a real Astro
type check and a build. The matrix covers default, theme, UI-only, Page-only,
Post-only, optional MDX, external plugin, taxonomy, external taxonomy and
CMS-free content editing. All resolve the 79 public exports and reject the
recorded private subpaths; only the MDX consumer installs that integration.
The current main archive has 121 files, including `COMPATIBILITY.md`. The
separate external fixture has six exports and fourteen files.

Schema-v2 proof retains the actual archives, locks, installed files, authored
sources, logs, loaded source paths, compiled namespaces/content and container
inspection. The independent workspace verifier compares these with its own
reviewed records; a child success flag is insufficient. Focused `--fixture`
runs are local checks, not release certification. Run
`python3 tests/test_packed_matrix.py /absolute/proof -v` for the retained matrix
and `python3 tests/test_packed_runtime.py /absolute/proof/consumer/dist -v` for
the primary built page in Chromium without a server. See
[COMPATIBILITY.md](COMPATIBILITY.md) for verified runtime scope and remaining
release gates.

The exact public exports and packed files are recorded in `contracts/astro-public-surface.json`. The published Core export targets and hashes are recorded in `contracts/rc9-package.json`. The release gate checks the registry lock, installed Core bytes, archive closure, and public export map without reading the sibling HTML checkout or using the network.
