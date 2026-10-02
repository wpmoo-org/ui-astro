import type { APIRoute } from "astro";
import { sectionMetadata } from "../sections";

export const GET: APIRoute = () => Response.json(sectionMetadata);
