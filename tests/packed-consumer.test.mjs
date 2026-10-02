import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertConsumerOutput,
  assertPackedPageOutput,
  assertThemeOutput,
  assertPrivateSubpathError,
  assertPeerConflict,
  validateConsumerLock,
  validateConsumerFixture,
} from "../scripts/verify_packed_consumer.mjs";

const fixture = await readFile(
  new URL("./fixtures/consumer/src/pages/index.astro", import.meta.url),
  "utf8",
);
const manifest = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const fixtureManifest = JSON.parse(
  await readFile(
    new URL("./fixtures/consumer/package.json", import.meta.url),
    "utf8",
  ),
);
const fixtureLock = JSON.parse(
  await readFile(
    new URL("./fixtures/consumer/package-lock.json", import.meta.url),
    "utf8",
  ),
);
const core = JSON.parse(
  await readFile(
    new URL("../contracts/rc9-package.json", import.meta.url),
    "utf8",
  ),
);

test("the independent fixture resolves every published Astro source entrypoint", () => {
  assert.equal(validateConsumerFixture({ source: fixture, manifest }), 78);
  assert.throws(
    () =>
      validateConsumerFixture({
        source: fixture.replace(
          'import "@wpmoo/astro/styles.css";',
          'import "@wpmoo/ui/moo-ui.css";',
        ),
        manifest,
      }),
    /consumer imports must use exact Astro public entrypoints/,
  );
});

test("public fixture imports distinguish executed declarations from comments and quoted examples", () => {
  const examples = [
    '// import "@wpmoo/astro/styles.css";',
    '/* import "@wpmoo/astro/styles.css"; */',
    "const example = 'import \"@wpmoo/astro/styles.css\";';",
  ];
  for (const example of examples) {
    const withExample = fixture.replace(
      'import "@wpmoo/astro/styles.css";',
      `${example}\nimport "@wpmoo/astro/styles.css";`,
    );
    assert.equal(
      validateConsumerFixture({ source: withExample, manifest }),
      78,
    );
    const withoutDeclaration = fixture.replace(
      'import "@wpmoo/astro/styles.css";',
      example,
    );
    assert.throws(
      () => validateConsumerFixture({ source: withoutDeclaration, manifest }),
      /consumer imports must use exact Astro public entrypoints/,
    );
  }
  const htmlExample =
    '<!-- <script>import "@wpmoo/astro/styles.css";</script> -->';
  assert.equal(
    validateConsumerFixture({ source: `${fixture}\n${htmlExample}`, manifest }),
    78,
  );
  assert.throws(
    () =>
      validateConsumerFixture({
        source: fixture.replace(
          'import "@wpmoo/astro/styles.css";',
          htmlExample,
        ),
        manifest,
      }),
    /consumer imports must use exact Astro public entrypoints/,
  );
});

test("consumer lock keeps the published RC9 URL and integrity while pinning the local adapter", () => {
  assert.doesNotThrow(() =>
    validateConsumerLock({ fixtureManifest, fixtureLock, manifest, core }),
  );
  const changed = structuredClone(fixtureLock);
  changed.packages["node_modules/@wpmoo/ui"].integrity = "sha512-wrong";
  assert.throws(
    () =>
      validateConsumerLock({
        fixtureManifest,
        fixtureLock: changed,
        manifest,
        core,
      }),
    /consumer Core release pin/,
  );
});

test("the MD-only consumer lock certifies one host peer and no MDX integration", () => {
  const duplicate = structuredClone(fixtureLock);
  duplicate.packages["node_modules/@wpmoo/astro/node_modules/astro"] =
    duplicate.packages["node_modules/astro"];
  assert.throws(
    () =>
      validateConsumerLock({
        fixtureManifest,
        fixtureLock: duplicate,
        manifest,
        core,
      }),
    /one certified host Astro peer/,
  );
  const mdx = structuredClone(fixtureLock);
  mdx.packages["node_modules/@astrojs/mdx"] = { version: "8.0.2" };
  assert.throws(
    () =>
      validateConsumerLock({
        fixtureManifest,
        fixtureLock: mdx,
        manifest,
        core,
      }),
    /without MDX/,
  );
});

test("incompatible peer evidence must be npm ERESOLVE for the exact certified Astro peer", () => {
  assert.doesNotThrow(() =>
    assertPeerConflict(
      {
        status: 1,
        stderr:
          'npm error ERESOLVE\nnpm error peer astro@"7.3.3" from @wpmoo/astro',
      },
      "7.3.3",
    ),
  );
  for (const result of [
    { status: 0, stderr: "" },
    { status: 1, stderr: "npm error ENOTCACHED" },
    { status: 1, stderr: "npm error EUSAGE" },
    { status: 1, stderr: 'npm error ERESOLVE peer astro@"7.3.4"' },
  ]) {
    assert.throws(
      () => assertPeerConflict(result, "7.3.3"),
      /incompatible host must fail/,
    );
  }
});

test("packed consumer HTML must show public wrappers, Layout, Page grid, and escaped text", () => {
  const html =
    '<div data-moo-document-owner="true" data-bs-theme="dark"><div data-layout="app" data-slot="sidebar-wrapper"><aside data-slot="sidebar" id="packed-sidebar"></aside><div data-slot="page"><main id="main-content"><div data-page-container><p data-public-wrapper-count="45" data-public-part-count="7" data-public-page-view-count="3" data-context-plugin="page" data-context-link="/contact" data-navigation-count="2" data-config-sidebar="none" data-config-slug="iletisim" data-plugin-id="page"></p><button class="btn btn-icon-sm" aria-label="Open actions">+</button><div>&lt;img src=x onerror=alert(1)&gt;</div><div data-toast-show-on-load="true"><button aria-label="Dismiss saved toast"></button>&lt;svg onload=alert(2)&gt;</div><strong>Approved</strong><section data-layout="page-grid"></section></div></main></div></div></div>';
  assert.doesNotThrow(() => assertConsumerOutput(html));
  assert.throws(
    () =>
      assertConsumerOutput(
        html.replace(
          'data-public-wrapper-count="45"',
          'data-public-wrapper-count="44"',
        ),
      ),
    /45 public wrapper imports/,
  );
  assert.throws(
    () =>
      assertConsumerOutput(
        html.replace(
          'data-context-link="/contact"',
          'data-context-link="/wrong"',
        ),
      ),
    /canonical Page context link/,
  );
  assert.throws(
    () =>
      assertConsumerOutput(
        html.replace(
          "&lt;img src=x onerror=alert(1)&gt;",
          "<img src=x onerror=alert(1)>",
        ),
      ),
    /untrusted text must be escaped/,
  );
  assert.throws(
    () =>
      assertConsumerOutput(
        html.replace(
          'data-toast-show-on-load="true"',
          'data-toast-show-on-load="false"',
        ),
      ),
    /published Toast startup hook/,
  );
  assert.throws(
    () =>
      assertConsumerOutput(
        html.replace("&lt;svg onload=alert(2)&gt;", "<svg onload=alert(2)>"),
      ),
    /Toast untrusted body must be escaped/,
  );
});

test("private deep imports must fail at the package exports boundary", () => {
  assert.doesNotThrow(() =>
    assertPrivateSubpathError({
      status: 1,
      stderr: "Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath",
    }),
  );
  assert.throws(
    () =>
      assertPrivateSubpathError({
        status: 1,
        stderr: "Error [ERR_MODULE_NOT_FOUND]: missing file",
      }),
    /ERR_PACKAGE_PATH_NOT_EXPORTED/,
  );
});

test("independent Page output requires two published routes and excludes draft", () => {
  const contact =
    '<title>Contact</title><div class="moo-ui page page-contact"><h1>Contact</h1><p>Independent Page content.</p><a href="/contact">Contact</a></div>';
  const guide =
    '<title>Setup guide</title><div data-slot="sidebar"><a href="/guide/setup" aria-current="page">Setup guide</a></div><h1>Setup guide</h1><p>Independent guide content.</p>';
  assert.doesNotThrow(() =>
    assertPackedPageOutput({ contact, guide, draftExists: false }),
  );
  assert.throws(
    () => assertPackedPageOutput({ contact, guide, draftExists: true }),
    /Draft Page/,
  );
  assert.throws(
    () =>
      assertPackedPageOutput({
        contact,
        guide: guide.replace('aria-current="page"', ""),
        draftExists: false,
      }),
    /Guide Page route/,
  );
});

test("independent theme evidence requires inherited utilities and one isolated replacement", () => {
  const rail = (tokens) => `<div class="${tokens}" data-page-container></div>`;
  const header = '<header class="bg-body-tertiary border-bottom">';
  const output = {
    home: rail("container-xl py-3 py-md-5"),
    contact: header + rail("container-lg"),
    guide: header + rail("container-xl py-3 py-md-5"),
  };
  assert.doesNotThrow(() => assertThemeOutput(output));
  assert.throws(
    () =>
      assertThemeOutput({
        ...output,
        contact: header + rail("container-lg py-3 py-md-5"),
      }),
    /contact.*resolved theme/,
  );
});
