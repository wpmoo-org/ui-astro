import { getNotFoundOptions } from "@wpmoo/astro/not-found";
export const GET = () => {
  const main = getNotFoundOptions();
  return Response.json([
    main,
    ...main.languageLinks
      .filter((link) => link.locale !== main.locale)
      .map((link) => getNotFoundOptions(link.locale)),
  ]);
};
