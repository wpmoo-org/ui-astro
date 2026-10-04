import * as bootstrap from "bootstrap/dist/js/bootstrap.esm.js";

// Moo's published Sidebar runtime reads Bootstrap plugins from this host global.
if (typeof window !== "undefined") window.bootstrap = bootstrap;
