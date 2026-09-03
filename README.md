# Moo UI Astro

`@wpmoo/ui-astro` is the Astro starter template and component package for themes
that use Moo UI. It consumes the published `@wpmoo/ui` CSS and Bootstrap
JavaScript contracts; it does not copy the HTML catalog or its Jinja build
templates.

## Install

Install the package in an Astro project:

```bash
npm install @wpmoo/ui-astro
```

The package brings the compatible `@wpmoo/ui`, Astro, and Bootstrap runtime
dependencies with it.

## Use Layouts

For pages with an application shell, import one layout instead of composing the
Sidebar anatomy by hand:

```astro
---
import Inset from "@wpmoo/ui-astro/layouts/Inset.astro";
---

<Inset
  title="Dashboard"
  groups={[{ label: "Workspace", items: [{ title: "Overview", href: "/", icon: "panel-left", active: true }] }]}
>
  <h1>Dashboard</h1>
</Inset>
```

Public starter layouts are exported from `@wpmoo/ui-astro/layouts/Default.astro`,
`@wpmoo/ui-astro/layouts/Sidebar.astro`,
`@wpmoo/ui-astro/layouts/Inset.astro`, and
`@wpmoo/ui-astro/layouts/Floating.astro`.

## Use Components

Load Moo UI CSS from the consuming theme layout, then import the wrappers you
need:

```astro
---
import "@wpmoo/ui/moo-ui.css";
import Button from "@wpmoo/ui-astro/components/Button.astro";
import Card from "@wpmoo/ui-astro/components/Card.astro";
import Badge from "@wpmoo/ui-astro/components/Badge.astro";
import Input from "@wpmoo/ui-astro/components/Input.astro";
---

<Card title="Account">
  <Button type="submit">Save changes</Button>
  <Badge label="Ready" variant="success" />
  <Input label="Email" id="email" name="email" type="email" />
</Card>
```

Every public wrapper is a direct file under `src/components/`; the package does
not provide a namespace directory or copy the HTML catalog. Consumers own their
page routes and theme shell.

Bootstrap's bundle owns native dropdown, collapse, modal, offcanvas, tab,
popover, tooltip, toast, and button behavior. Load it from the consuming layout
when those components are used:

```astro
<script>
  import "bootstrap/dist/js/bootstrap.bundle.min.js";
</script>
```

Combobox, standalone Sidebar components, Data Table, Chart, and Date Picker use
optional Moo ESM modules. These modules are side-effect-free and never scan the
document; pass the roots owned by the theme to their documented initializers
explicitly:

```astro
<script>
  import MooUI from "@wpmoo/ui/moo-ui.js";

  for (const root of document.querySelectorAll(".combobox")) {
    MooUI.Combobox.getOrCreateInstance(root);
  }
</script>
```

Use the focused entrypoint instead when only one Moo-owned behavior is needed,
for example `@wpmoo/ui/chart.js` or `@wpmoo/ui/datepicker.js`.

## Package Development

Install the package's development dependencies and start its smoke surface:

```bash
npm install
npm run dev -- --host 0.0.0.0 --port 4322
```

Open `http://localhost:4322` in the browser.

## Layout

```text
astro/
  astro.config.mjs
  package.json
  src/
    components/       # Public wrappers, one PascalCase file per component
    layouts/           # Shared document and theme shell
    pages/             # Astro routes
```

All public component wrappers are exported from direct paths such as
`@wpmoo/ui-astro/components/Button.astro` and
`@wpmoo/ui-astro/components/DataTable.astro`.

String content is escaped by default. Components that accept structured rich
content expose `trustedHtml`; set it to `true` only for caller-owned, precomposed
markup. Never pass user-controlled or remote text through that option.

The `Default`, `Sidebar`, `Inset`, and `Floating` layouts are the recommended
Sidebar application-shell API. The lower-level `Sidebar` component remains
available for custom shells and renders a runtime-compatible sidebar primitive
from `groups` or the shorter `items` prop:

```astro
---
import Sidebar from "@wpmoo/ui-astro/components/Sidebar.astro";
---

<Sidebar
  id="main-sidebar"
  brand="Moo UI"
  groups={[{ label: "Workspace", items: [{ title: "Overview", href: "/", icon: "panel-left", active: true }] }]}
  footerText="Theme foundation"
/>
```

Use the `header`, `content`, and `footer` slots only when custom regions are
needed; menu controls supplied through slots must retain the documented
`data-sidebar-*` hooks.

## Build

```bash
npm run build
```

Moo UI remains the CSS owner. Astro owns composition, routing, and theme
layouts; Bootstrap owns its native browser behavior; Moo ESM modules remain
optional and must be initialized explicitly when a wrapper needs them.
