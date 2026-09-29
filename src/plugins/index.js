const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const routeParameter = /^\[(?:\.\.\.)?[A-Za-z][A-Za-z0-9_]*\]$/;
const reservedRoots = new Set(["404", "_astro", "_server_islands", "_actions", "__moo_content_integrity"]);

function plainRecord(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function record(value, label, keys) {
  if (!plainRecord(value)) throw new TypeError(`${label} must be a plain object`);
  for (const key of Object.keys(value)) {
    if (!keys.includes(key)) throw new TypeError(`${label}.${key} is not supported`);
  }
  return value;
}

function identifier(value, label) {
  if (typeof value !== "string" || !idPattern.test(value)) {
    throw new TypeError(`${label} must be a lowercase kebab ID`);
  }
  return value;
}

function labelText(value, label) {
  if (typeof value !== "string" || !value.trim() || /[\x00-\x1f\x7f]/u.test(value)) {
    throw new TypeError(`${label} must be nonempty plain text`);
  }
  return value.trim();
}

function localUrl(value, label, directory) {
  if (!(value instanceof URL) || value.protocol !== "file:" || value.host ||
      value.search || value.hash || value.username || value.password) {
    throw new TypeError(`${label} must be a local file URL without a query or fragment`);
  }
  if (directory === true && !value.pathname.endsWith("/")) {
    throw new TypeError(`${label} must be a directory URL ending in /`);
  }
  if (directory === false && value.pathname.endsWith("/")) {
    throw new TypeError(`${label} must be a file URL`);
  }
  return value.href;
}

function pathSegments(value, label, { parameters = false, terminalSlash = false } = {}) {
  if (typeof value !== "string" || !value.startsWith("/") ||
      /[\\?#%\x00-\x1f\x7f]/u.test(value)) {
    throw new TypeError(`${label} must be a canonical local path`);
  }
  if (value === "/") return [];
  if (value.endsWith("/") && !terminalSlash) {
    throw new TypeError(`${label} cannot end with /`);
  }
  const segments = value.slice(1, value.endsWith("/") ? -1 : undefined).split("/");
  if (segments.some((segment) => !idPattern.test(segment) && !(parameters && routeParameter.test(segment)))) {
    throw new TypeError(`${label} has an invalid literal or parameter segment`);
  }
  if (reservedRoots.has(segments[0])) {
    throw new TypeError(`${label} uses a reserved root namespace`);
  }
  return segments;
}

function source(input, label) {
  if (!plainRecord(input)) throw new TypeError(`${label} must be a source descriptor`);
  switch (input.kind) {
    case "markdown": {
      record(input, label, ["kind", "base", "formats"]);
      const formats = input.formats;
      if (!Array.isArray(formats) ||
          !(formats.length === 1 && formats[0] === "md" ||
            formats.length === 2 && formats[0] === "md" && formats[1] === "mdx")) {
        throw new TypeError(`${label}.formats must be ['md'] or ['md', 'mdx']`);
      }
      return Object.freeze({
        kind: "markdown",
        ...(input.base === undefined ? {} : { base: localUrl(input.base, `${label}.base`, true) }),
        formats: Object.freeze([...formats]),
      });
    }
    case "json": {
      record(input, label, ["kind", "file"]);
      const file = localUrl(input.file, `${label}.file`, false);
      if (!new URL(file).pathname.endsWith(".json")) throw new TypeError(`${label}.file must name a JSON file`);
      return Object.freeze({ kind: "json", file });
    }
    case "json-directory": {
      record(input, label, ["kind", "base"]);
      return Object.freeze({ kind: "json-directory", base: localUrl(input.base, `${label}.base`, true) });
    }
    default:
      throw new TypeError(`${label}.kind is unsupported: ${String(input.kind)}`);
  }
}

function route(input, label) {
  record(input, label, ["id", "pattern", "prerender", "owner", "entrypoint"]);
  const id = identifier(input.id, `${label}.id`);
  const pattern = input.pattern;
  pathSegments(pattern, `${label}.pattern`, { parameters: true });
  if (input.prerender !== true) throw new TypeError(`${label}.prerender must be true`);
  const owner = input.owner ?? "plugin";
  if (owner === "host") {
    if (Object.hasOwn(input, "entrypoint")) {
      throw new TypeError(`${label}.entrypoint is forbidden for host-owned routes`);
    }
    return Object.freeze({ id, pattern, prerender: true, owner });
  }
  if (owner !== "plugin") throw new TypeError(`${label}.owner must be plugin or host`);
  return Object.freeze({
    id, pattern, prerender: true, owner,
    entrypoint: localUrl(input.entrypoint, `${label}.entrypoint`, false),
  });
}

function contentType(input, label) {
  record(input, label, ["id", "collection", "singleRoute", "source", "taxonomies"]);
  const id = identifier(input.id, `${label}.id`);
  const collection = identifier(input.collection, `${label}.collection`);
  if ((id === "page" || id === "post") && collection !== id) {
    throw new TypeError(`${label}.collection for ${id} must be ${id}`);
  }
  const singleRoute = identifier(input.singleRoute, `${label}.singleRoute`);
  let taxonomies = [];
  if (input.taxonomies !== undefined) {
    if (!Array.isArray(input.taxonomies)) throw new TypeError(`${label}.taxonomies must be an array`);
    taxonomies = input.taxonomies.map((taxonomy, index) => identifier(taxonomy, `${label}.taxonomies[${index}]`));
    if (new Set(taxonomies).size !== taxonomies.length) {
      throw new TypeError(`${label}.taxonomies contains duplicate IDs`);
    }
  }
  return Object.freeze({
    id, collection, singleRoute,
    source: source(input.source, `${label}.source`),
    taxonomies: Object.freeze(taxonomies),
  });
}

function navigationItem(input, label, basePath) {
  record(input, label, ["label", "path", "match"]);
  const text = labelText(input.label, `${label}.label`);
  pathSegments(input.path, `${label}.path`);
  if (basePath !== "/" && input.path !== basePath && !input.path.startsWith(`${basePath}/`)) {
    throw new TypeError(`${label}.path is outside ${basePath}`);
  }
  const match = input.match ?? "exact";
  if (match !== "exact" && match !== "prefix") throw new TypeError(`${label}.match is unsupported`);
  return Object.freeze({ label: text, path: input.path, match });
}

function uniqueBy(items, key, label) {
  const values = items.map((item) => item[key]);
  if (new Set(values).size !== values.length) throw new TypeError(`${label} has duplicate ${key}`);
}

function fullPattern(basePath, pattern) {
  return basePath === "/" ? pattern : pattern === "/" ? basePath : `${basePath}${pattern}`;
}

export function definePlugin(input) {
  record(input, "plugin", ["apiVersion", "id", "label", "basePath", "contentTypes", "routes", "navigation"]);
  if (input.apiVersion !== 1) {
    throw new TypeError(`plugin.apiVersion ${String(input.apiVersion)} is unsupported; supported version is 1`);
  }
  const id = identifier(input.id, "plugin.id");
  const label = labelText(input.label, "plugin.label");
  pathSegments(input.basePath, "plugin.basePath", { terminalSlash: true });
  const basePath = input.basePath !== "/" ? input.basePath.replace(/\/$/u, "") : "/";
  if ((id === "page") !== (basePath === "/")) {
    throw new TypeError("plugin.basePath / belongs only to page, and page must own /");
  }
  if (!Array.isArray(input.contentTypes) || !input.contentTypes.length) {
    throw new TypeError("plugin.contentTypes must be a nonempty array");
  }
  if (!Array.isArray(input.routes) || !input.routes.length) {
    throw new TypeError("plugin.routes must be a nonempty array");
  }
  const contentTypes = input.contentTypes.map((value, index) => contentType(value, `plugin.contentTypes[${index}]`));
  const routes = input.routes.map((value, index) => route(value, `plugin.routes[${index}]`));
  uniqueBy(contentTypes, "id", "plugin.contentTypes");
  uniqueBy(contentTypes, "collection", "plugin.contentTypes");
  uniqueBy(routes, "id", "plugin.routes");
  const paths = routes.map((item) => fullPattern(basePath, item.pattern));
  if (new Set(paths).size !== paths.length) throw new TypeError("plugin.routes has duplicate final pattern");
  const mapped = new Set();
  for (const type of contentTypes) {
    if (mapped.has(type.singleRoute)) throw new TypeError(`plugin.contentTypes has duplicate singleRoute ${type.singleRoute}`);
    mapped.add(type.singleRoute);
    const selected = routes.find((item) => item.id === type.singleRoute);
    if (!selected) throw new TypeError(`plugin.contentTypes.${type.id}.singleRoute ${type.singleRoute} is missing`);
    const parts = pathSegments(selected.pattern, `plugin.contentTypes.${type.id}.singleRoute`, { parameters: true });
    if (parts.at(-1) !== "[...slug]" || parts.slice(0, -1).some((part) => !idPattern.test(part))) {
      throw new TypeError(`plugin.contentTypes.${type.id}.singleRoute requires a literal-prefix/[...slug] catchall`);
    }
  }
  let navigation = [];
  if (input.navigation !== undefined) {
    if (!Array.isArray(input.navigation)) throw new TypeError("plugin.navigation must be an array");
    navigation = input.navigation.map((value, index) => navigationItem(value, `plugin.navigation[${index}]`, basePath));
  }
  return Object.freeze({
    apiVersion: 1, id, label, basePath,
    contentTypes: Object.freeze(contentTypes),
    routes: Object.freeze(routes),
    navigation: Object.freeze(navigation),
  });
}
