// Exercise Astro's actual development transforms without HTTP or a listening socket.
import assert from "node:assert/strict";
import {
  cp,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const demo = process.argv[2] === "demo";
const site = join(root, demo ? "apps/demo" : "apps/theme-pilot");
const fixture = await realpath(
  await mkdtemp(join(tmpdir(), "pilot-mdx-graph-")),
);
const require = createRequire(join(root, "package.json"));
const astroRoot = dirname(require.resolve("astro/package.json"));
const load = (path) => import(pathToFileURL(join(astroRoot, "dist", path)));
const { resolveConfig } = await load("core/config/config.js");
const { createSettings } = await load("core/config/settings.js");
const { AstroLogger } = await load("core/logger/core.js");
const { runHookConfigSetup, runHookConfigDone } = await load(
  "integrations/hooks.js",
);
const { createRoutesList } = await load("core/routing/create-manifest.js");
const { createVite } = await load("core/create-vite.js");
const { devServerAppReadySymbol } = await load("core/constants.js");
const { createServer } = await import(
  pathToFileURL(createRequire(join(astroRoot, "package.json")).resolve("vite"))
);
const messages = [];
const logger = new AstroLogger({
  level: "error",
  destination: { write: (event) => messages.push(event.message) },
});
let server;
try {
  await cp(site, fixture, {
    recursive: true,
    filter: (path) =>
      !["node_modules", ".astro", "dist", ".cache", ".vite", ".git"].includes(
        path.split(/[/\\]/u).at(-1),
      ),
  });
  // This functional graph test uses the development workspace packages. The
  // separate sealed consumer certifies actual archive installs and compiled hrefs.
  await symlink(
    join(root, "node_modules"),
    join(fixture, "node_modules"),
    "dir",
  );
  await writeFile(join(fixture, "package.json"), '{"type":"module"}\n');
  if (demo)
    await writeFile(
      join(fixture, "tsconfig.json"),
      '{"extends":"astro/tsconfigs/strict","include":["**/*"],"exclude":["dist"]}\n',
    );
  const transport = {
    middlewareMode: true,
    hmr: false,
    watch: null,
    ws: false,
  };
  const { astroConfig } = await resolveConfig(
    {
      root: fixture,
      vite: {
        cacheDir: join(fixture, ".vite"),
        server: transport,
        optimizeDeps: { noDiscovery: true },
      },
    },
    "dev",
  );
  let settings = await createSettings(astroConfig, "error", fixture);
  settings = await runHookConfigSetup({ settings, command: "dev", logger });
  await runHookConfigDone({ settings, command: "dev", logger });
  const routesList = await createRoutesList({ settings }, logger, {
    dev: true,
  });
  const config = await createVite(
    { server: transport },
    {
      settings,
      logger,
      mode: "development",
      command: "dev",
      sync: false,
      routesList,
    },
  );
  server = await createServer(config);
  assert.equal(server.httpServer, null, "no HTTP server");
  assert.equal(server.config.server.ws, false, "no WebSocket listener");
  // Match Astro's request readiness gate before concurrent module loading.
  await server[devServerAppReadySymbol];
  const environment = server.environments.ssr;
  for (const locale of demo ? ["en"] : ["en", "de"]) {
    const path = join(
      fixture,
      demo
        ? "content/page/en/enhanced-page.mdx"
        : `src/content/page/${locale}/enhanced.mdx`,
    );
    // Load the renderable entry before traversing its development asset graph.
    await environment.runner.import(path);
    const propagated = await environment.runner.import(
      `${path}?astroPropagatedAssets`,
    );
    assert.equal(propagated.default.__astroPropagation, true);
    assert.ok(Array.isArray(propagated.default.collectedStyles));
    const content = await propagated.default.getMod();
    assert.equal(content.frontmatter.locale, locale);
    if (!demo) assert.equal(content.frontmatter.translationKey, "enhanced");
    assert.equal(typeof content.Content, "function", "renderable MDX content");
    console.log(
      `${demo ? "demo" : process.env.PILOT_MAIN_LANGUAGE}/${locale}: development asset graph loaded`,
    );
  }
  assert.deepEqual(messages, [], "development startup diagnostics");
} finally {
  if (server) await server.close();
  await rm(fixture, { recursive: true, force: true });
}
