// One address per page (docs/url-design.md): lowercase, and no slash at the end. A page asked for
// any other way (/Wyatt, /explore/) is sent to its one address with a 301. What only the site's
// own pages call (/api) and admin are left as they are.

/** The address `pathname` should be at, or null if it already is. */
export function tidyPath(pathname: string): string | null {
  if (pathname.startsWith("/api/") || pathname.startsWith("/admin/")) return null;
  let p = pathname.replace(/\/+$/, "") || "/";
  p = p.toLowerCase();
  return p === pathname ? null : p;
}
