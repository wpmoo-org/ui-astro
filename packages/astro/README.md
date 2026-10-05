# Moo UI Astro

`@wpmoo/astro` is the MIT foundation for building Astro sites and independently
licensed themes with Moo UI. It provides public components, one shared Layout,
Single/Archive/Loop views and optional Page/Post and taxonomy features.

**Status:** The `0.1.0` candidate is unpublished and marked private. Demo content
lives in the repository's `apps/demo/` and stays outside the npm package.

## Install

Use Node.js `22.12.0` or newer and the certified Astro `7.3.3`. For the current
candidate, install a reviewed local archive in your own Astro application:

```bash
npm install /absolute/path/wpmoo-astro-0.1.0.tgz astro@7.3.3
```

After publication, the registry installation will be:

```bash
npm install @wpmoo/astro astro@7.3.3
```

Commit the application's lockfile. See [compatibility](COMPATIBILITY.md) for
tested versions and optional integrations.

## Compose a page

For example, in `src/pages/index.astro`:

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
  <Button element="a" href="/">Overview</Button>
</Layout>
```

The Sidebar's `id` must match `sidebarId`. Omit the Sidebar prop and slot for a
page without one. Layout owns the shared CSS, runtime and content spacing;
the site supplies its content and configuration.

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

## Documentation

- [Package guide](https://github.com/wpmoo-org/ui-astro/blob/main/docs/guide.md):
  component/runtime APIs, theme preferences, content plugins, taxonomies,
  MD/MDX, multilingual routes, SEO and verification.
- [Compatibility](COMPATIBILITY.md): certified versions and release limits.

## Develop locally

From the repository root, the demo runs on port `4322`:

```bash
npm run dev
npm run check
npm test
npm run build
```

## License

[MIT](LICENSE). Original themes and extensions can have their own licenses;
third-party dependencies retain theirs. See the licenses for
[@wpmoo/ui 1.0.0](https://github.com/wpmoo-org/ui/blob/v1.0.0/LICENSE),
[Bootstrap 5.3.8](https://github.com/twbs/bootstrap/blob/v5.3.8/LICENSE) and
[Astro 7.3.3](https://github.com/withastro/astro/blob/astro%407.3.3/LICENSE).
Embedded icon geometry retains its
[Lucide/Feather notices](https://github.com/lucide-icons/lucide/blob/main/LICENSE)
in the icon source. The aggregate third-party notice file stays outside npm.
