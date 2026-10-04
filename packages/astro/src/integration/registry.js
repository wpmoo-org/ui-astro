import { siteHref } from "../content/paths.js";
import { defineTaxonomy } from "../taxonomies/index.js";
import { taxonomyMount, resolveTaxonomyArchive } from "../taxonomies/urls.js";

function fullPattern(basePath, pattern) {
  return basePath === "/"
    ? pattern
    : pattern === "/"
      ? basePath
      : `${basePath}${pattern}`;
}

function insideNamespace(path, namespace) {
  return path === namespace || path.startsWith(`${namespace}/`);
}

function resolveTaxonomyRoutes(input = {}) {
  if (
    input === null ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(input))
  ) {
    throw new TypeError("moo.taxonomyRoutes must be a plain object");
  }
  for (const key of Object.keys(input)) {
    if (key !== "archive")
      throw new TypeError(`moo.taxonomyRoutes.${key} is unsupported`);
  }
  const archive = input.archive === undefined ? "plugin" : input.archive;
  if (archive !== "plugin" && archive !== "host") {
    throw new TypeError("moo.taxonomyRoutes.archive must be plugin or host");
  }
  return Object.freeze({ archive });
}

export function buildRegistry(
  plugins,
  {
    taxonomies = [],
    taxonomyBasePath = "/topics",
    taxonomyRoutes,
    lang = "en",
  } = {},
) {
  if (!Array.isArray(plugins))
    throw new TypeError("moo.plugins must be an array");
  const ids = new Set();
  const types = new Map();
  const collections = new Map();
  const namespaces = new Map();
  const patterns = new Map();
  const contentTypes = [];
  const routeClaims = [];
  const routes = [];
  const mount = taxonomyMount(taxonomyBasePath);
  const taxonomyOwnership = resolveTaxonomyRoutes(taxonomyRoutes);
  if (!Array.isArray(taxonomies))
    throw new TypeError("moo.taxonomies must be an array");

  for (const plugin of plugins) {
    if (
      !plugin ||
      plugin.apiVersion !== 1 ||
      typeof plugin.id !== "string" ||
      typeof plugin.basePath !== "string" ||
      !Array.isArray(plugin.contentTypes) ||
      !Array.isArray(plugin.routes)
    ) {
      throw new TypeError("moo.plugins requires version 1 plugin descriptors");
    }
    if (ids.has(plugin.id))
      throw new TypeError(`moo.plugins has duplicate plugin ${plugin.id}`);
    ids.add(plugin.id);
    if (plugin.basePath !== "/") {
      for (const [namespace, owner] of namespaces) {
        if (
          insideNamespace(plugin.basePath, namespace) ||
          insideNamespace(namespace, plugin.basePath)
        ) {
          throw new TypeError(
            `moo namespace ${plugin.basePath} conflicts between ${owner} and ${plugin.id}`,
          );
        }
      }
      namespaces.set(plugin.basePath, plugin.id);
    }

    for (const type of plugin.contentTypes) {
      if (types.has(type.id))
        throw new TypeError(
          `moo type ${type.id} is owned by both ${types.get(type.id)} and ${plugin.id}`,
        );
      if (collections.has(type.collection)) {
        throw new TypeError(
          `moo collection ${type.collection} is owned by both ${collections.get(type.collection)} and ${plugin.id}`,
        );
      }
      types.set(type.id, plugin.id);
      collections.set(type.collection, plugin.id);
      contentTypes.push(Object.freeze({ owner: plugin.id, ...type }));
    }
    for (const route of plugin.routes) {
      const pattern = fullPattern(plugin.basePath, route.pattern);
      if (patterns.has(pattern)) {
        throw new TypeError(
          `moo route pattern ${pattern} is owned by both ${patterns.get(pattern)} and ${plugin.id}`,
        );
      }
      patterns.set(pattern, plugin.id);
      const claim = Object.freeze({
        owner: plugin.id,
        pattern,
        routeOwner: route.owner,
      });
      routeClaims.push(claim);
      if (route.owner === "plugin") {
        routes.push(
          Object.freeze({
            owner: plugin.id,
            pattern,
            entrypoint: new URL(route.entrypoint),
            prerender: true,
          }),
        );
      }
    }
  }
  const selected = new Map();
  for (const taxonomy of taxonomies) {
    if (!taxonomy || typeof taxonomy.source !== "string")
      throw new TypeError(
        "moo.taxonomies requires normalized taxonomy descriptors",
      );
    const normalized = defineTaxonomy({
      ...taxonomy,
      source: new URL(taxonomy.source),
    });
    if (selected.has(normalized.id))
      throw new TypeError(`moo has duplicate taxonomy ${normalized.id}`);
    if (types.has(normalized.id) || collections.has(normalized.id))
      throw new TypeError(
        `moo taxonomy ${normalized.id} conflicts with an active type or collection`,
      );
    selected.set(normalized.id, normalized);
  }
  for (const type of contentTypes) {
    for (const id of type.taxonomies) {
      if (!selected.has(id))
        throw new TypeError(
          `moo type ${type.id} binds inactive taxonomy ${id}`,
        );
    }
  }
  const groups = new Map();
  const archiveNamespaces = new Map();
  for (const taxonomy of selected.values()) {
    if (!taxonomy.archive) continue;
    const archive = resolveTaxonomyArchive(taxonomy, {
      lang,
      taxonomyBasePath: mount,
    });
    const group = groups.get(archive.pattern) ?? {
      pattern: archive.pattern,
      root: archive.root,
      taxonomies: [],
      routeOwner: taxonomyOwnership.archive,
    };
    group.taxonomies.push(taxonomy.id);
    groups.set(archive.pattern, group);
    if (archive.root) continue;
    const namespace =
      archive.taxonomySegment === undefined ? archive.basePath : mount;
    for (const [other, owner] of namespaces) {
      if (
        insideNamespace(namespace, other) ||
        insideNamespace(other, namespace)
      )
        throw new TypeError(
          `moo namespace ${namespace} conflicts between taxonomy ${taxonomy.id} and ${owner}`,
        );
    }
    for (const [other, pattern] of archiveNamespaces) {
      if (
        pattern !== archive.pattern &&
        (insideNamespace(namespace, other) || insideNamespace(other, namespace))
      )
        throw new TypeError(
          `moo taxonomy namespace ${namespace} conflicts between ${pattern} and ${archive.pattern}`,
        );
    }
    archiveNamespaces.set(namespace, archive.pattern);
  }
  const taxonomyGroups = [...groups.values()].map((group) =>
    Object.freeze({ ...group, taxonomies: Object.freeze(group.taxonomies) }),
  );
  for (const group of taxonomyGroups.filter((item) => item.root)) {
    const existing = routeClaims.find(
      (claim) => claim.pattern === group.pattern,
    );
    if (existing) {
      const plugin = plugins.find((item) => item.id === existing.owner);
      if (
        plugin.id !== "page" ||
        !plugin.contentTypes.some(
          (type) => type.id === "page" && type.collection === "page",
        )
      )
        throw new TypeError(
          `moo root taxonomy archives conflict with ${plugin.id} renderer; use explicit host composition without automatic root archives`,
        );
      if (existing.routeOwner !== group.routeOwner)
        throw new TypeError(
          `Page routes.single (${existing.routeOwner}) and moo.taxonomyRoutes.archive (${group.routeOwner}) at ${group.pattern} must select the same owner`,
        );
      routeClaims.splice(routeClaims.indexOf(existing), 1);
      const injected = routes.findIndex(
        (route) => route.pattern === group.pattern,
      );
      if (injected !== -1) routes.splice(injected, 1);
    }
    routeClaims.push(
      Object.freeze({
        owner: "root",
        pattern: group.pattern,
        routeOwner: group.routeOwner,
      }),
    );
    if (group.routeOwner === "plugin")
      routes.push(
        Object.freeze({
          owner: "root",
          pattern: group.pattern,
          entrypoint: new URL("./routes/[...root].astro", import.meta.url),
          prerender: true,
        }),
      );
  }
  for (const group of taxonomyGroups.filter((item) => !item.root)) {
    const pattern = group.pattern;
    if (patterns.has(pattern))
      throw new TypeError(
        `moo taxonomy route pattern ${pattern} conflicts with ${patterns.get(pattern)}`,
      );
    routeClaims.push(
      Object.freeze({
        owner: "taxonomy",
        pattern,
        routeOwner: group.routeOwner,
      }),
    );
    if (group.routeOwner === "plugin")
      routes.push(
        Object.freeze({
          owner: "taxonomy",
          pattern,
          entrypoint: new URL(
            "../taxonomies/routes/[taxonomy]/[slug].astro",
            import.meta.url,
          ),
          prerender: true,
        }),
      );
  }
  return Object.freeze({
    plugins: Object.freeze([...plugins]),
    contentTypes: Object.freeze(contentTypes),
    routeClaims: Object.freeze(routeClaims),
    routes: Object.freeze(routes),
    taxonomies: Object.freeze([...selected.values()]),
    taxonomyBasePath: mount,
    taxonomyRoutes: taxonomyOwnership,
    taxonomyGroups: Object.freeze(taxonomyGroups),
    lang,
  });
}

export function validateResolvedRoutes(registry, resolved) {
  if (!Array.isArray(resolved))
    throw new TypeError("Astro resolved routes must be an array");
  for (const claim of registry.routeClaims) {
    const matches = resolved.filter((route) => route.pattern === claim.pattern);
    if (matches.length > 1) {
      throw new TypeError(
        `moo ${claim.owner} route ${claim.pattern} has multiple resolved owners`,
      );
    }
    const expectedOrigin = claim.routeOwner === "host" ? "project" : "external";
    if (matches.length !== 1 || matches[0].origin !== expectedOrigin) {
      throw new TypeError(
        `moo ${claim.owner} requires one ${expectedOrigin} route at ${claim.pattern}`,
      );
    }
    if (matches[0].isPrerendered !== true) {
      throw new TypeError(
        `moo ${claim.owner} route ${claim.pattern} must prerender`,
      );
    }
  }
  for (const group of registry.taxonomyGroups) {
    const prefix = group.pattern.slice(0, group.pattern.indexOf("["));
    for (const route of resolved) {
      if (
        route.type !== "page" ||
        route.origin === "internal" ||
        route.pattern === group.pattern
      )
        continue;
      if (group.root) {
        if (
          route.pattern.startsWith(prefix) &&
          /^\[(?:\.\.\.)?[^\]]+\]$/u.test(route.pattern.slice(prefix.length))
        )
          throw new TypeError(
            `moo root route ${group.pattern} conflicts with undeclared native owner ${route.entrypoint} (${route.pattern})`,
          );
      } else {
        const namespace = prefix.replace(/\/$/u, "");
        if (insideNamespace(route.pattern, namespace))
          throw new TypeError(
            `moo taxonomy namespace ${namespace} conflicts with native owner ${route.entrypoint} (${route.pattern})`,
          );
      }
    }
  }
}

export function validateNativePageRoutes(routes, integrityEntrypoint, root) {
  for (const route of routes) {
    if (route.type !== "page" || route.origin === "internal") continue;
    if (
      route.pattern === "/__moo_content_integrity/[...probe]" &&
      route.origin === "external" &&
      new URL(route.entrypoint, root).href === integrityEntrypoint.href
    )
      continue;
    for (const segment of route.segments) {
      const dynamic = segment.some((part) => part.dynamic);
      const literal = segment
        .filter((part) => !part.dynamic)
        .map((part) => part.content)
        .join("");
      const valid = dynamic
        ? /^[a-z0-9-]*$/u.test(literal)
        : /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(literal);
      if (!valid) {
        throw new TypeError(
          `moo native page ${route.entrypoint} requires canonical URL literals: ${route.pattern}`,
        );
      }
    }
  }
}

export function validateBuiltPagePaths(pages, routes) {
  for (const { pathname } of pages) {
    const path = `/${pathname.replace(/^\//u, "")}`.replace(/\/$/u, "") || "/";
    const owner = routes.find(
      (route) => route.type === "page" && route.patternRegex.test(path),
    );
    if (owner?.origin === "internal") continue;
    try {
      siteHref(path);
    } catch {
      throw new TypeError(
        `moo native page ${owner?.entrypoint ?? "(unresolved owner)"} generated a noncanonical URL: ${path}`,
      );
    }
  }
}

export function validateExpectedRouteOwners(expected, routes) {
  for (const { id, locale, path, pattern } of expected) {
    const owner = routes.find((route) => {
      if (route.type !== "page") return false;
      const regex =
        typeof route.patternRegex === "string"
          ? new RegExp(route.patternRegex, route.regexFlags)
          : route.patternRegex;
      // The inventory uses normalized output paths; Astro's public regex
      // follows trailingSlash and may require the directory slash.
      return regex?.test(path) || regex?.test(`${path.replace(/\/$/u, "")}/`);
    });
    if (owner?.pattern !== pattern)
      throw new TypeError(
        `moo published content ${id} (locale ${locale}) at ${path} has an owner conflict: expected ${pattern}, resolved ${owner?.entrypoint ?? "(no page owner)"} (${owner?.pattern ?? "none"})`,
      );
  }
}

export function validateExpectedPagePaths(pages, routes, expected) {
  const emitted = new Set();
  for (const { pathname } of pages) {
    const path = `/${pathname.replace(/^\//u, "")}`.replace(/\/$/u, "") || "/";
    if (emitted.has(path))
      throw new TypeError(`moo multiple emitted page owners at ${path}`);
    emitted.add(path);
  }
  for (const { id, locale, path } of expected) {
    if (!emitted.has(path))
      throw new TypeError(
        `moo published content ${id} has no emitted route at ${path} (locale ${locale})`,
      );
  }
  validateExpectedRouteOwners(expected, routes);
}
