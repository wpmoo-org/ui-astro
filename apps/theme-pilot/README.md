# Independent theme pilot

This private site owns English/German content, navigation, term data and URL
choices. It is excluded from root workspaces and installs versioned SDK/theme
archives under `../../artifacts/theme-pilot/`, with its own strict config/lock.

After preparing those archives, run `npm ci --offline --strict-peer-deps`,
`npm run check` and `npm run build` from this directory. `PILOT_MAIN_LANGUAGE`
selects `en` or `de`; `PILOT_CATEGORY_PROFILE` selects `category`, `short` or
`root`. The main language has no URL prefix. The native route tree follows
that setting; shared source stays under `src/`.

The Page adapter prepares locale-aware links on the server and passes them to
MDX as `props.links`. MDX sections receive ready-to-render data; they do not
import server query facades into Astro's propagated asset graph.

Site preferences replace the theme's inset via `projectDefaults`. Update a
versioned archive dependency and its lock to replace theme presentation;
content and route files stay in this project. No live deployment, CMS or
commercial updater is included. Sealed evidence and runtime/visual gates
are recorded separately in the dated pilot certification.
