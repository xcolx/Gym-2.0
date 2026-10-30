// Shared by scripts/generate-sw.mjs, the service worker (inlined into public/sw.js, so only plain functions without
// imports) and src/lib/pwa/sw-routes.test.ts. See "PWA" in ARCHITECTURE.md.

/**
 * The cache of the stored images (GET /api/<version>/images/<hash>), see "Image cache" in ARCHITECTURE.md. Same name
 * as IMAGE_CACHE in src/lib/pwa/image-cache.ts, which prunes and clears it.
 */
export const IMAGE_CACHE = "gym2-images";

/** The header with the time an image was cached (milliseconds since 1970), for pruning the unused ones */
export const CACHED_AT_HEADER = "x-gym2-cached-at";

/**
 * The hash of a stored image if the pathname is one (/api/v1/images/<64 hex characters>), otherwise null
 *
 * @param {string} pathname
 * @returns {string | null}
 */
export function imageHashOf(pathname) {
  const match = /^\/api\/v\d+\/images\/([0-9a-f]{64})$/.exec(pathname);
  return match ? match[1] : null;
}

/** The prefix of the placeholders, chosen so it can't appear in a rendered page by accident */
const PLACEHOLDER_PREFIX = "__gym2_param_";

/** A segment value that can be put into the HTML and the JSON of the template without escaping */
const SAFE_SEGMENT = /^[A-Za-z0-9._~%-]+$/;

/**
 * The precache entry of an app route ("/home", "/workout/schemes/[schemeId]"). Null for routes the worker can't
 * render offline: catch-all segments ([...slug], [[...slug]]).
 *
 * @param {string} route
 * @returns {{ route: string, url: string, segments: string[], params: string[] } | null}
 */
export function pageEntry(route) {
  const segments = route.split("/").filter(Boolean);
  const params = [];
  const urlSegments = [];
  for (const segment of segments) {
    if (segment.startsWith("[...") || segment.startsWith("[[")) return null;
    const match = /^\[(.+)\]$/.exec(segment);
    if (match) {
      params.push(match[1]);
      urlSegments.push(placeholder(match[1]));
    } else {
      urlSegments.push(segment);
    }
  }
  return { route, url: `/${urlSegments.join("/")}`, segments, params };
}

/** @param {string} param */
export function placeholder(param) {
  return `${PLACEHOLDER_PREFIX}${param}__`;
}

/** "/home/" → "/home", "" → "/" */
export function normalizePathname(pathname) {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/**
 * The values of the parameters if the pathname matches the page, keyed by placeholder. Null if it doesn't match or a
 * value has characters that would need escaping (the worker then doesn't answer from the template).
 *
 * @param {string} pathname
 * @param {{ segments: string[], params: string[] }} page
 * @returns {Record<string, string> | null}
 */
export function matchPage(pathname, page) {
  const parts = normalizePathname(pathname).split("/").filter(Boolean);
  if (parts.length !== page.segments.length) return null;
  /** @type {Record<string, string>} */
  const values = {};
  for (let i = 0; i < parts.length; i++) {
    const segment = page.segments[i];
    const match = /^\[(.+)\]$/.exec(segment);
    if (match) {
      if (!SAFE_SEGMENT.test(parts[i])) return null;
      values[placeholder(match[1])] = parts[i];
    } else if (segment !== parts[i]) {
      return null;
    }
  }
  return values;
}

/**
 * The precached page for a pathname: a static page first (like Next.js prefers /workout/schemes/add over
 * /workout/schemes/[schemeId]), then the template with the fewest parameters.
 *
 * @template {{ url: string, segments: string[], params: string[] }} Page
 * @param {string} pathname
 * @param {Page[]} pages
 * @returns {{ page: Page, values: Record<string, string> } | null}
 */
export function findPage(pathname, pages) {
  const ordered = [...pages].sort((a, b) => a.params.length - b.params.length);
  for (const page of ordered) {
    const values = matchPage(pathname, page);
    if (values) return { page, values };
  }
  return null;
}

/**
 * Replaces the placeholders of a template by the values of the request.
 *
 * @param {string} text
 * @param {Record<string, string>} values
 */
export function fillTemplate(text, values) {
  let filled = text;
  for (const [key, value] of Object.entries(values)) filled = filled.split(key).join(value);
  return filled;
}
