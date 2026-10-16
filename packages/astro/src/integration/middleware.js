import { defineMiddleware } from "astro:middleware";
import { validateSiteContent } from "../context/index.js";
import { runDevContentGate } from "../content/integrity.js";

export const onRequest = defineMiddleware((_context, next) => runDevContentGate(validateSiteContent, next));
