import { z } from "astro/zod";

// Colour maths and the primary hover/active derivation are ported from Core:
// projects/ui/html/site/src/js/catalog/theme-builder-schema.js
// (primaryStateColors, mixRgb, relativeLuminance, contrastRatio) and
// docs/contracts/THEME_PRESETS.md "Primary Hover and Active".

// Core surfaces (projects/ui/html/scss): $white #ffffff; $light #fafafa
// (_config.scss; tertiary and sidebar); $secondary #f4f4f5 (_config.scss;
// muted); dark: $black #0a0a0a, $moo-sidebar-dark #1c1c1f,
// $moo-input-bg-dark = mix(#27272a 50%, #0a0a0a) = #19191a,
// $body-tertiary-bg-dark #202024, $moo-muted-surface-dark #27272a
// (settings/_palette.scss).
const LIGHT_SURFACES = ["#ffffff", "#fafafa", "#f4f4f5"];
const DARK_SURFACES = ["#0a0a0a", "#1c1c1f", "#19191a", "#202024", "#27272a"];
const DARK_MUTED_SURFACE = "#27272a";
const LIGHT_FOREGROUND = "#ffffff";
const DARK_FOREGROUND = "#0a0a0a";
const TEXT_CONTRAST = 4.5;
const RING_CONTRAST = 3;
const NAVBAR_LINK_ALPHA = 0.65;
const SURFACE_SELECTORS = ['.moo-ui[data-bs-theme][data-header-surface="dark"]'];

// Core exporter RADIUS_TOKENS (theme-builder-schema.js); "default" emits nothing.
const RADIUS_TOKENS = {
  default: {},
  none: {
    "--bs-border-radius": "0",
    "--bs-border-radius-sm": "0",
    "--bs-border-radius-lg": "0",
    "--bs-border-radius-xl": "0",
    "--bs-border-radius-xxl": "0",
  },
  small: {
    "--bs-border-radius": "0.25rem",
    "--bs-border-radius-sm": "0.1875rem",
    "--bs-border-radius-lg": "0.375rem",
    "--bs-border-radius-xl": "0.5rem",
    "--bs-border-radius-xxl": "0.75rem",
  },
  medium: {
    "--bs-border-radius": "0.5rem",
    "--bs-border-radius-sm": "0.375rem",
    "--bs-border-radius-lg": "0.625rem",
    "--bs-border-radius-xl": "0.75rem",
    "--bs-border-radius-xxl": "1rem",
  },
  large: {
    "--bs-border-radius": "0.75rem",
    "--bs-border-radius-sm": "0.5rem",
    "--bs-border-radius-lg": "1rem",
    "--bs-border-radius-xl": "1.25rem",
    "--bs-border-radius-xxl": "1.5rem",
  },
};

export function hexToRgb(hex) {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function rgbHex(rgb) {
  return `#${rgb.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function mixRgb(target, rgb, weight) {
  const ratio = weight / 100;
  return rgb.map((channel, index) => Math.round(target[index] * ratio + channel * (1 - ratio)));
}

export function relativeLuminance(rgb) {
  const [red, green, blue] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(a, b) {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((left, right) => right - left);
  return (lighter + 0.05) / (darker + 0.05);
}

const ratio = (a, b) => contrastRatio(hexToRgb(a), hexToRgb(b));

export function primaryStateColors(primaryHex, foregroundHex, surfaceHex = "#ffffff") {
  const primary = hexToRgb(primaryHex);
  const foreground = hexToRgb(foregroundHex);
  const surface = hexToRgb(surfaceHex);
  const anchor = relativeLuminance(foreground) > relativeLuminance(primary) ? [0, 0, 0] : [255, 255, 255];
  const passes = (rgb) => contrastRatio(rgb, foreground) >= TEXT_CONTRAST;
  const toward = (k) => mixRgb(anchor, primary, k * 8);
  const lastK = 12;
  const searchFrom = (k) => {
    let at = Math.min(Math.max(k, 1), lastK);
    while (at < lastK && !passes(toward(at))) at += 1;
    return at;
  };
  const hover0 = mixRgb(surface, primary, 20);
  const active0 = mixRgb(surface, primary, 28);
  const hoverKept = passes(hover0);
  const hoverK = hoverKept ? 0 : searchFrom(1);
  const hover = hoverKept ? hover0 : toward(hoverK);
  const active = hoverKept && passes(active0) ? active0 : toward(searchFrom(hoverK + 1));
  return { hover: rgbHex(hover), active: rgbHex(active) };
}

/** #ffffff or #0a0a0a, whichever contrasts more with the background. */
export function readableForeground(background) {
  return ratio(background, LIGHT_FOREGROUND) >= ratio(background, DARK_FOREGROUND) ? LIGHT_FOREGROUND : DARK_FOREGROUND;
}

/**
 * Core renders the ring at 50% alpha over the surface. The ring mixes the
 * primary toward black (light surfaces) or white (dark surfaces) by the
 * smallest t in 0, 0.08, ..., 0.96 whose rendered colour reaches 3:1 on every
 * given surface. `ratio` is the lowest rendered ratio; `surface` names it.
 * `ok` is false only when even t = 0.96 fails.
 */
export function ringColor(primaryHex, surfaces) {
  const list = Array.isArray(surfaces) ? surfaces : [surfaces];
  const primary = hexToRgb(primaryHex);
  const light = list.every((surface) => relativeLuminance(hexToRgb(surface)) > 0.179);
  const anchor = light ? [0, 0, 0] : [255, 255, 255];
  let result = null;
  for (let step = 0; step <= 12; step += 1) {
    const ring = mixRgb(anchor, primary, step * 8);
    const worst = list
      .map((surface) => ({ surface, ratio: contrastRatio(mixRgb(hexToRgb(surface), ring, 50), hexToRgb(surface)) }))
      .sort((left, right) => left.ratio - right.ratio)[0];
    result = { ring: rgbHex(ring), ratio: worst.ratio, surface: worst.surface, ok: worst.ratio >= RING_CONTRAST };
    if (result.ok) return result;
  }
  return result;
}

/** Link hover text: primary mixed toward black, smallest t >= 0.08 that reaches 4.5:1 on every light surface. */
export function linkHoverColor(primaryHex) {
  const primary = hexToRgb(primaryHex);
  let hover = primary;
  for (let step = 1; step <= 12; step += 1) {
    hover = mixRgb([0, 0, 0], primary, step * 8);
    if (LIGHT_SURFACES.every((surface) => contrastRatio(hover, hexToRgb(surface)) >= TEXT_CONTRAST)) break;
  }
  return rgbHex(hover);
}

const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/u, "must be a #rrggbb colour")
  .transform((value) => value.toLowerCase());
const fontStack = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !/[;{}<>\\\x00-\x1f\x7f]|\/\*|\*\//u.test(value), "must be a plain CSS font-family stack");

export const themeSchema = z.strictObject({
  colors: z
    .strictObject({
      primary: hex,
      primaryForeground: hex.optional(),
      inverseSurface: hex.optional(),
      inverseForeground: hex.optional(),
    })
    .optional(),
  fonts: z.strictObject({ body: fontStack.optional(), heading: fontStack.optional() }).optional(),
  radius: z.enum(["default", "none", "small", "medium", "large"]).optional(),
  typography: z.enum(["app", "website"]).optional(),
});

const fixed = (value) => value.toFixed(2);

/**
 * Derives every token from a parsed theme and checks the contrast rules.
 * Throws a TypeError naming each failing pair and its measured ratio.
 */
export function resolveTheme(theme) {
  const colors = theme.colors;
  const problems = [];
  const check = (label, a, b, minimum) => {
    const measured = ratio(a, b);
    if (measured < minimum) problems.push(`site.theme: ${label} is ${fixed(measured)}:1, needs ${minimum}:1`);
  };
  const resolved = {
    fonts: theme.fonts ?? {},
    radius: theme.radius ?? "default",
    typography: theme.typography ?? null,
    colors: null,
  };
  if (colors) {
    const { primary, inverseSurface } = colors;
    if (colors.inverseForeground && !inverseSurface)
      problems.push("site.theme: colors.inverseForeground requires colors.inverseSurface");
    const foreground = colors.primaryForeground ?? readableForeground(primary);
    const states = primaryStateColors(primary, foreground);
    const labelOk = ratio(primary, foreground) >= TEXT_CONTRAST;
    check(`primary ${primary} with primaryForeground ${foreground}`, primary, foreground, TEXT_CONTRAST);
    const lowest = (colour, surfaces) => surfaces.map((surface) => ({ surface, measured: ratio(colour, surface) })).sort((a, b) => a.measured - b.measured)[0];
    const linkWorst = lowest(primary, LIGHT_SURFACES);
    check(`link colour primary ${primary} on surface ${linkWorst.surface}`, primary, linkWorst.surface, TEXT_CONTRAST);
    const linkHover = linkHoverColor(primary);
    const hoverWorst = lowest(linkHover, LIGHT_SURFACES);
    check(`link hover colour ${linkHover} (primary ${primary} toward #000000) on surface ${hoverWorst.surface}`, linkHover, hoverWorst.surface, TEXT_CONTRAST);
    if (labelOk) {
      check(`primary hover ${states.hover} with primaryForeground ${foreground}`, states.hover, foreground, TEXT_CONTRAST);
      check(`primary active ${states.active} with primaryForeground ${foreground}`, states.active, foreground, TEXT_CONTRAST);
    }
    const rings = { light: ringColor(primary, LIGHT_SURFACES), dark: ringColor(primary, DARK_SURFACES) };
    for (const [name, value] of [["light", rings.light], ["dark", rings.dark]])
      if (!value.ok) problems.push(`site.theme: ring ${value.ring} on ${name} surface ${value.surface} is ${fixed(value.ratio)}:1, needs ${RING_CONTRAST}:1`);
    resolved.colors = { primary, primaryForeground: foreground, hover: states.hover, active: states.active, linkHover, ring: { light: rings.light.ring, dark: rings.dark.ring }, inverse: null };
    if (inverseSurface) {
      // The inverse surface is a dark scope (data-bs-theme="dark").
      const against = ratio(inverseSurface, "#ffffff");
      if (against < TEXT_CONTRAST)
        problems.push(`site.theme: inverseSurface ${inverseSurface} must be dark; against #ffffff it is ${fixed(against)}:1, needs ${TEXT_CONTRAST}:1`);
      const inverseForeground = colors.inverseForeground ?? readableForeground(inverseSurface);
      check(`inverseForeground ${inverseForeground} on inverseSurface ${inverseSurface}`, inverseForeground, inverseSurface, TEXT_CONTRAST);
      check(`inverseForeground ${inverseForeground} on dark muted surface ${DARK_MUTED_SURFACE}`, inverseForeground, DARK_MUTED_SURFACE, TEXT_CONTRAST);
      const navbar = rgbHex(mixRgb(hexToRgb(inverseForeground), hexToRgb(inverseSurface), NAVBAR_LINK_ALPHA * 100));
      check(`navbar link ${navbar} (inverseForeground ${inverseForeground} at 65% over inverseSurface ${inverseSurface}) on inverseSurface`, navbar, inverseSurface, TEXT_CONTRAST);
      const ring = ringColor(primary, [inverseSurface, ...DARK_SURFACES]);
      if (!ring.ok) problems.push(`site.theme: ring ${ring.ring} on surface ${ring.surface} is ${fixed(ring.ratio)}:1, needs ${RING_CONTRAST}:1`);
      resolved.colors.inverse = { surface: inverseSurface, foreground: inverseForeground, ring: ring.ring };
    }
  }
  if (problems.length) throw new TypeError(problems.join("\n"));
  return resolved;
}

const rgbCsv = (value) => hexToRgb(value).join(", ");
const block = (selectors, declarations) => {
  const lines = Object.entries(declarations);
  return lines.length ? `${selectors.join(",\n")} {\n${lines.map(([key, value]) => `  ${key}: ${value};`).join("\n")}\n}\n` : "";
};

/** The single theme stylesheet, or "" when nothing is configured. */
export function themeCss(resolved) {
  if (!resolved) return "";
  const { colors, fonts, radius } = resolved;
  const shared = {};
  if (colors) {
    Object.assign(shared, {
      "--moo-primary": colors.primary,
      "--bs-primary": colors.primary,
      "--bs-primary-rgb": rgbCsv(colors.primary),
      "--moo-primary-foreground": colors.primaryForeground,
      "--moo-primary-foreground-dark": colors.primaryForeground,
      "--moo-primary-hover": colors.hover,
      "--moo-primary-active": colors.active,
    });
  }
  if (fonts.body) shared["--bs-body-font-family"] = fonts.body;
  if (fonts.heading) shared["--moo-heading-font-family"] = fonts.heading;
  Object.assign(shared, RADIUS_TOKENS[radius]);
  const link = (color, hover) => ({
    "--bs-link-color": color,
    "--bs-link-color-rgb": rgbCsv(color),
    "--bs-link-hover-color": hover,
    "--bs-link-hover-color-rgb": rgbCsv(hover),
  });
  const rules = [block([".moo-ui[data-bs-theme]"], shared)];
  if (colors) {
    rules.push(block(['.moo-ui[data-bs-theme="light"]'], { ...link(colors.primary, colors.linkHover), "--moo-ring": colors.ring.light }));
    rules.push(block(['.moo-ui[data-bs-theme="dark"]'], { "--moo-ring": colors.ring.dark }));
    const inverse = colors.inverse;
    if (inverse) {
      const [r, g, b] = [rgbCsv(inverse.surface), rgbCsv(inverse.foreground)];
      rules.push(block(SURFACE_SELECTORS, {
        "--moo-surface": inverse.surface,
        "--bs-body-bg": inverse.surface,
        "--bs-body-bg-rgb": r,
        "--bs-tertiary-bg": inverse.surface,
        "--bs-tertiary-bg-rgb": r,
        "--moo-foreground": inverse.foreground,
        "--bs-body-color": inverse.foreground,
        "--bs-body-color-rgb": g,
        "--bs-emphasis-color": inverse.foreground,
        "--bs-emphasis-color-rgb": g,
        ...link(inverse.foreground, inverse.foreground),
        "--moo-ring": inverse.ring,
      }));
    }
  }
  return rules.join("");
}
