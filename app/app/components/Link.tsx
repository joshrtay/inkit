// The site's links: React Router's Link and NavLink, loading the next page's data and code as soon
// as the pointer rests on a link or it's focused (`prefetch="intent"`), so a click has less to wait
// for. Not for pages that are heavy to load or that we'd rather not load on a hover: the editors,
// admin pages, /new, sign-in and the API. Import these instead of react-router's.
import { forwardRef } from "react";
import { Link as RRLink, NavLink as RRNavLink, type LinkProps, type NavLinkProps } from "react-router";
import { prefetchable } from "~/lib/prefetch";

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ prefetch, ...props }, ref) {
  return <RRLink ref={ref} prefetch={prefetch ?? (props.reloadDocument || !prefetchable(props.to) ? "none" : "intent")} {...props} />;
});

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(function NavLink({ prefetch, ...props }, ref) {
  return <RRNavLink ref={ref} prefetch={prefetch ?? (props.reloadDocument || !prefetchable(props.to) ? "none" : "intent")} {...props} />;
});
