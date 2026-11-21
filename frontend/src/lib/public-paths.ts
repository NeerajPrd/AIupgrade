// Pages anyone may read without an account: website visitors, clients and Meta's App Review
// must be able to open the Privacy Policy and Terms. Keep this list short on purpose — every
// other page still sends logged-out visitors to /login.
//
// Plain TypeScript with no imports, so tests/public-paths.test.mjs can run it with `node --test`.
//
// The legal text itself lives on the static marketing site; next.config.mjs redirects these two
// dashboard paths there (permanently). They stay listed here so no login check can ever get in
// the way of that redirect.

export const PRIVACY_POLICY_URL = "https://spirit-monkey.com/privacy-policy/";
export const TERMS_URL = "https://spirit-monkey.com/terms/";

export const PUBLIC_PAGE_PATHS: readonly string[] = ["/privacy-policy", "/terms-and-conditions"];

function normalise(pathname: string): string {
  const path = (pathname || "/").split(/[?#]/)[0];
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}

/** True for the public pages above (exact path, trailing slash allowed). */
export function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGE_PATHS.includes(normalise(pathname));
}

/**
 * Should a 401 from the API send the browser to /login? Not when already on /login, and not on a
 * public page: there a logged-out visitor is expected and the page must stay where it is.
 */
export function shouldRedirectToLogin(pathname: string): boolean {
  const path = normalise(pathname);
  return path !== "/login" && !isPublicPage(path);
}
