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

## Use Components

Load Moo UI CSS from the consuming theme layout, then import the wrappers you
need:

```astro
---
import "@wpmoo/ui/moo-ui.css";
import Button from "@wpmoo/ui-astro/components/Button.astro";
import Card from "@wpmoo/ui-astro/components/Card.astro";
---

<Card title="Account">
  <Button type="submit">Save changes</Button>
</Card>
```

Consumers own their page routes and theme shell. Bootstrap's bundle should be
loaded by the consuming layout when the chosen components need Bootstrap's
native JavaScript behavior. Moo ESM modules remain optional and must be
initialized explicitly.

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
    components/       # Astro wrappers around documented Moo UI markup
    layouts/           # Shared document and theme shell
    pages/             # Astro routes
    styles/            # Template-owned additions only
```

The initial foundation includes `Button`, `Card`, and `Badge`.
Additional wrappers should be added only after their HTML, ARIA, data, and
runtime contracts are documented in the UI project contracts.

## Build

```bash
npm run build
```

Moo UI remains the CSS owner. Astro owns composition, routing, and theme
layouts; Bootstrap owns its native browser behavior; Moo ESM modules remain
optional and must be initialized explicitly when a wrapper needs them.
