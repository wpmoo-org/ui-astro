import { isAbsolute, join, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { lstat, readdir } from "node:fs/promises";

export async function assertPlainInputTree(root) {
  const info = await lstat(root);
  if (info.isSymbolicLink())
    throw new Error(`prepared input symlink is forbidden: ${root}`);
  if (info.isDirectory()) {
    for (const entry of await readdir(root))
      await assertPlainInputTree(join(root, entry));
  } else if (!info.isFile())
    throw new Error(`prepared input has an unsupported file kind: ${root}`);
}

function contains(parent, child) {
  const path = relative(resolve(parent), resolve(child));
  return (
    path === "" ||
    (!path.startsWith("../") && path !== ".." && !isAbsolute(path))
  );
}

export function assertPackedContainer(actual, expected) {
  if (actual.Image !== expected.image)
    throw new Error(
      "packed container image identity differs from the inspected local image",
    );
  const config = actual.HostConfig;
  if (config?.NetworkMode !== "none")
    throw new Error("packed container network must be none");
  if (
    config.Privileged ||
    config.CapAdd?.length ||
    config.Devices?.length ||
    config.DeviceRequests?.length
  ) {
    throw new Error(
      "packed container must not be privileged or add host devices/capabilities",
    );
  }
  if (!config.ReadonlyRootfs)
    throw new Error("packed container image filesystem must be read-only");
  if (config.PublishAllPorts || Object.keys(config.PortBindings ?? {}).length) {
    throw new Error("packed container must not publish a port");
  }
  if (config.VolumesFrom?.length || actual.Mounts?.length !== 2)
    throw new Error(
      "packed container requires exactly two artifact/cache mounts",
    );
  for (const path of [expected.output, expected.cache]) {
    if (
      !isAbsolute(path) ||
      contains(expected.workspace, path) ||
      contains(path, expected.workspace)
    ) {
      throw new Error(
        "packed mounts must be outside and cannot contain the workspace",
      );
    }
  }
  if (
    contains(expected.output, expected.cache) ||
    contains(expected.cache, expected.output)
  ) {
    throw new Error("packed proof and cache mounts must be disjoint");
  }
  const proof = actual.Mounts.find((mount) => mount.Destination === "/proof");
  const cache = actual.Mounts.find((mount) => mount.Destination === "/cache");
  if (
    proof?.Type !== "bind" ||
    proof.Source !== expected.output ||
    proof.RW !== true
  ) {
    throw new Error(
      "packed proof mount must contain only the prepared artifact directory",
    );
  }
  if (
    cache?.Type !== "bind" ||
    cache.Source !== expected.cache ||
    cache.RW !== false
  ) {
    throw new Error(
      "packed cache mount must be the inspected read-only primed cache",
    );
  }
  if (
    JSON.stringify(actual.Config?.Entrypoint) !== '["node"]' ||
    JSON.stringify(actual.Config?.Cmd) !==
      '["/proof/run_packed_consumer.mjs","/proof/request.json"]'
  ) {
    throw new Error(
      "packed container must use the retained isolated runner command",
    );
  }
}

export function validateProfileLock({
  manifest,
  lock,
  artifacts,
  core,
  profile,
}) {
  if (lock.lockfileVersion !== 3 || !lock.packages?.[""])
    throw new Error(`${profile}: a real npm v3 execution lock is required`);
  const direct = { ...manifest.dependencies, ...manifest.devDependencies };
  for (const [name, artifact] of Object.entries(artifacts)) {
    if (!Object.hasOwn(direct, name)) continue;
    const expected = `file:../${artifact.filename}`;
    const installed = lock.packages[`node_modules/${name}`];
    if (
      direct[name] !== expected ||
      installed?.resolved !== expected ||
      installed?.version !== artifact.manifest.version
    ) {
      throw new Error(
        `${profile}: ${name} must depend on its retained tarball`,
      );
    }
    if (installed.integrity !== artifact.integrity)
      throw new Error(
        `${profile}: ${name} archive integrity differs from the retained tarball`,
      );
    for (const field of ["dependencies", "peerDependencies"]) {
      if (
        !isDeepStrictEqual(
          installed[field] ?? {},
          artifact.manifest[field] ?? {},
        )
      ) {
        throw new Error(
          `${profile}: ${name} ${field} differs from the packed manifest`,
        );
      }
    }
  }
  if (!direct["@wpmoo/astro"])
    throw new Error(
      `${profile}: the main retained tarball dependency is required`,
    );
  for (const [name, version] of Object.entries(direct)) {
    if (
      !Object.hasOwn(artifacts, name) &&
      !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/u.test(version)
    ) {
      throw new Error(
        `${profile}: source or unpinned dependency ${name} is forbidden`,
      );
    }
  }
  for (const field of ["dependencies", "devDependencies"]) {
    if (
      !isDeepStrictEqual(lock.packages[""][field] ?? {}, manifest[field] ?? {})
    ) {
      throw new Error(
        `${profile}: execution lock root ${field} differs from the consumer manifest`,
      );
    }
  }
  const upstream = lock.packages[`node_modules/${core.package}`];
  if (
    upstream?.version !== core.version ||
    upstream.resolved !== core.registry_url ||
    upstream.integrity !== core.integrity
  ) {
    throw new Error(
      `${profile}: published Core release version, registry URL and integrity must be unchanged`,
    );
  }
  const packagePaths = Object.keys(lock.packages);
  const astroPaths = packagePaths.filter((path) =>
    path.endsWith("node_modules/astro"),
  );
  if (
    !isDeepStrictEqual(astroPaths, ["node_modules/astro"]) ||
    lock.packages[astroPaths[0]].version !==
      artifacts["@wpmoo/astro"].manifest.peerDependencies.astro
  ) {
    throw new Error(`${profile}: one certified Astro host is required`);
  }
  if (
    lock.packages["node_modules/bootstrap"]?.version !==
    artifacts["@wpmoo/astro"].manifest.dependencies.bootstrap
  ) {
    throw new Error(`${profile}: the certified Bootstrap version is required`);
  }
  const mdxPaths = packagePaths.filter((path) =>
    path.endsWith("node_modules/@astrojs/mdx"),
  );
  if (profile === "mdx") {
    if (
      !isDeepStrictEqual(mdxPaths, ["node_modules/@astrojs/mdx"]) ||
      direct["@astrojs/mdx"] !== "8.0.2" ||
      lock.packages[mdxPaths[0]]?.version !== "8.0.2"
    )
      throw new Error(
        `${profile}: the certified MDX 8.0.2 integration is required`,
      );
  } else if (mdxPaths.length)
    throw new Error(`${profile}: MD-only consumers must not install MDX`);
  for (const [path, value] of Object.entries(lock.packages)) {
    if (path === "") continue;
    const artifact = Object.entries(artifacts).find(
      ([name]) => path === `node_modules/${name}`,
    )?.[1];
    if (
      value.link ||
      (value.resolved?.startsWith("file:") && !artifact) ||
      /^(?:link:|workspace:)/u.test(value.resolved ?? "")
    ) {
      throw new Error(
        `${profile}: source directory or linked dependency ${path} is forbidden`,
      );
    }
    if (
      /node_modules\/(?:react(?:-dom)?|next|payload|tinacms|decap-cms[^/]*|@(?:keystatic|payloadcms)\/[^/]+)$/u.test(
        path,
      )
    ) {
      throw new Error(
        `${profile}: the installed consumer must remain CMS/React-free (${path})`,
      );
    }
  }
}

export function assertConsumerOutput(html) {
  const required = [
    ['data-moo-document-owner="true"', "Moo document owner"],
    ['data-slot="sidebar-wrapper"', "Sidebar wrapper"],
    ['data-slot="sidebar"', "direct Sidebar"],
    ['data-slot="page"', "Page"],
    ['id="main-content"', "focusable main"],
    ["data-page-container", "Page rail"],
    ['data-layout="page-grid"', "Page grid"],
    ['data-public-wrapper-count="46"', "46 public wrapper imports"],
    ['data-public-part-count="8"', "eight public include and view imports"],
    ['data-public-page-view-count="3"', "three public Page view imports"],
    ['data-context-plugin="page"', "public Page route context"],
    ['data-context-link="/contact"', "canonical Page context link"],
    ['data-navigation-count="2"', "public Page navigation"],
    ['data-config-sidebar="none"', "public site preference resolution"],
    ['data-config-slug="iletisim"', "public Turkish slug normalization"],
    ['data-plugin-id="page"', "public plugin descriptor"],
    ["btn-icon-sm", "published icon button size"],
    ['data-toast-show-on-load="true"', "published Toast startup hook"],
    ['aria-label="Dismiss saved toast"', "published Toast action label"],
    ["&lt;svg onload=alert(2)&gt;", "Toast untrusted body must be escaped"],
    ["<strong>Approved</strong>", "trusted caller markup opt-in"],
    ["&lt;img src=x onerror=alert(1)&gt;", "untrusted text must be escaped"],
    ['id="consumer-checkbox"', "published Checkbox label-wrapper input"],
    ['aria-label="Remove Pages"', "published Combobox selected chip removal"],
    [
      'aria-label="Remove Posts"',
      "published Combobox second selected chip removal",
    ],
  ];
  for (const [marker, label] of required) {
    if (!html.includes(marker))
      throw new Error(`consumer HTML is missing ${label}`);
  }
  if (html.includes("<img src=x onerror=alert(1)>")) {
    throw new Error("untrusted text must be escaped");
  }
  if (html.includes("<svg onload=alert(2)>")) {
    throw new Error("Toast untrusted body must be escaped");
  }
}

export function assertNotFoundOutput(html, data) {
  const escaped = (value) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  if (
    !html.includes(`lang="${data.locale}"`) ||
    !html.includes(escaped(data.title)) ||
    !html.includes(">404<")
  )
    throw new Error("native 404 copy or locale differs");
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/u)?.[1];
  if (!main?.includes(`href="${escaped(data.homeHref)}"`))
    throw new Error("native 404 recovery link differs");
  for (const tag of ["html", "body", "main", "h1"])
    if ([...html.matchAll(new RegExp(`<${tag}(?:\\s|>)`, "gu"))].length !== 1)
      throw new Error(`native 404 requires one ${tag}`);
  if ([...html.matchAll(/data-moo-document-owner="true"/gu)].length !== 1)
    throw new Error("native 404 requires one Moo document owner");
  if (
    /<link\b[^>]*rel="(?:canonical|alternate)"|<meta\b[^>]*(?:property="og:|name="twitter:)|<script\b[^>]*type="application\/ld\+json"/u.test(
      html,
    )
  )
    throw new Error("native 404 has successful-page metadata");
}

export function assertPackedPageOutput({ contact, guide, draftExists }) {
  for (const [html, title, body] of [
    [contact, "Contact", "Independent Page content."],
    [guide, "Setup guide", "Independent guide content."],
  ]) {
    if (
      !html.includes(`<title>${title}</title>`) ||
      !html.includes(body) ||
      [...html.matchAll(/<h1(?:\s|>)/gu)].length !== 1
    ) {
      throw new Error(
        `${title} Page route must render its published title and Markdown once`,
      );
    }
  }
  if (
    !contact.includes("page page-contact") ||
    !contact.includes('href="/contact"')
  ) {
    throw new Error(
      "Contact Page route must preserve its exact entry identity and canonical href",
    );
  }
  if (
    !guide.includes('data-slot="sidebar"') ||
    !guide.includes('href="/guide/setup"') ||
    !guide.includes('aria-current="page"')
  ) {
    throw new Error(
      "Guide Page route must inherit the public Sidebar and active canonical link",
    );
  }
  if (draftExists)
    throw new Error("Draft Page must not be published by the packed consumer");
}

export function assertPrivateSubpathError(result) {
  if (
    result.status === 0 ||
    !result.stderr.includes("ERR_PACKAGE_PATH_NOT_EXPORTED")
  ) {
    throw new Error(
      "private deep import must fail with ERR_PACKAGE_PATH_NOT_EXPORTED",
    );
  }
}

export function assertThemeOutput({ home, contact, guide }) {
  for (const [name, html, expected] of [
    ["home", home, ["container-xl", "py-3", "py-md-5"]],
    ["contact", contact, ["container-lg"]],
    ["guide", guide, ["container-xl", "py-3", "py-md-5"]],
  ]) {
    const rails = [
      ...html.matchAll(
        /<div\b(?=[^>]*\bdata-page-container(?:\s|>|=))[^>]*>/gu,
      ),
    ];
    const actual = rails[0]?.[0]
      .match(/\bclass="([^"]*)"/u)?.[1]
      .split(/\s+/u)
      .filter(Boolean)
      .sort();
    if (
      rails.length !== 1 ||
      JSON.stringify(actual) !== JSON.stringify([...expected].sort())
    ) {
      throw new Error(
        `${name} must render its resolved theme preferences on one Page rail`,
      );
    }
  }
  for (const html of [contact, guide]) {
    if (!html.includes('<header class="bg-body-tertiary border-bottom">')) {
      throw new Error(
        "Theme Header preferences must reach both built-in Page routes",
      );
    }
  }
}

export function assertPeerConflict(result, certifiedVersion) {
  if (
    result.status === 0 ||
    !result.stderr.includes("ERESOLVE") ||
    !result.stderr.includes(`peer astro@"${certifiedVersion}"`)
  ) {
    throw new Error(
      "incompatible host must fail with npm ERESOLVE for the certified Astro peer",
    );
  }
}
