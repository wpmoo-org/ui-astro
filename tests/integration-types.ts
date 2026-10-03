import moo from "@wpmoo/astro";

moo({ taxonomyRoutes: { archive: "host" } });
moo({ taxonomyRoutes: { archive: "plugin" } });
moo({ taxonomyRoutes: {} });
moo({
  taxonomyRoutes: {
    // @ts-expect-error Taxonomy archives have one explicit route owner.
    archive: "theme",
  },
});
moo({
  taxonomyRoutes: {
    // @ts-expect-error Taxonomy has no Single route ownership option.
    single: "host",
  },
});
moo({
  // @ts-expect-error Null cannot replace the taxonomy route ownership object.
  taxonomyRoutes: null,
});
