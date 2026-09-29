const canonical = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/u;

export function siteHref(localPath, { base = "/", trailingSlash = "ignore" } = {}) {
  if (typeof localPath !== "string" || !canonical.test(localPath)) {
    throw new TypeError(`content path must be canonical: ${String(localPath)}`);
  }
  const mount = typeof base === "string" && base !== "/" ? base.replace(/\/$/u, "") : "";
  if (typeof base !== "string" || !canonical.test(mount || "/")) {
    throw new TypeError(`host base must be canonical: ${String(base)}`);
  }
  if (!["always", "never", "ignore"].includes(trailingSlash)) {
    throw new TypeError(`host trailingSlash is unsupported: ${String(trailingSlash)}`);
  }
  if (localPath === "/") return mount ? trailingSlash === "never" ? mount : `${mount}/` : "/";
  const path = `${mount}${localPath}`;
  return trailingSlash === "always" ? `${path}/` : path;
}
