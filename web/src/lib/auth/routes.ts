const LANDING_ROUTE = "/";

/** Where signed-out users are sent, and the only routes they can open */
export const AUTH_ROUTE = "/auth";

/** Where signed-in users land, e.g. after the login */
export const HOME_ROUTE = "/home";

/** The privacy policy, linked from the sign up and the settings of both apps (https://gym2.app/privacy) */
export const PRIVACY_ROUTE = "/privacy";

/** The terms of use, accepted at the sign up and linked from the settings of both apps (https://gym2.app/tos) */
export const TERMS_ROUTE = "/tos";

/** The licences of the open source packages in the web app, linked from its settings and the landing page (web only) */
export const LICENSES_ROUTE = "/licenses";

/** Routes that don't need a session. Signed-in users opening them are sent to HOME_ROUTE. */
export function isPublicRoute(pathname: string): boolean {
  return pathname === AUTH_ROUTE || pathname.startsWith(`${AUTH_ROUTE}/`);
}

/**
 * Routes everyone can open, signed in or not, without redirects, the tab bar or the database (the landing page and the
 * legal pages and the licences)
 */
export function isOpenRoute(pathname: string): boolean {
  return (
    pathname === LANDING_ROUTE || pathname === PRIVACY_ROUTE || pathname === TERMS_ROUTE || pathname === LICENSES_ROUTE
  );
}
