import { isRouteErrorResponse, Link, Links, Meta, Outlet, Scripts, ScrollRestoration, useLoaderData, useMatches, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/root";
import "~site/styles/global.css";
import "./site.css";
import { cloudflareContext } from "./lib/context";
import { currentCreator } from "./lib/auth.server";
import { SideNav, TabBar } from "./components/Shell";

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Kaushan+Script&family=Kalam:wght@400;700&family=Nunito:wght@400;600;700;800&display=swap" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const creator = await currentCreator(context.get(cloudflareContext).env, request);
  return { me: creator && { id: creator.id, handle: creator.handle, name: creator.name, isAdmin: creator.isAdmin } };
}

/** The signed-in creator, from any route. */
export const useMe = () => useRouteLoaderData<typeof loader>("root")?.me ?? null;

// The saved light/dark choice, applied before the page draws (dark is the default).
const THEME = `(()=>{let t="dark";try{t=localStorage.getItem("wyattsgames:theme")||"dark"}catch{}if(t!=="auto")document.documentElement.dataset.theme=t==="light"?"light":"dark"})()`;

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
        <Meta />
        <Links />
      </head>
      <body>
        {/* the pen wobble game boards are drawn with (global.css: .sheet > svg) */}
        <svg className="ink-defs" aria-hidden="true" focusable="false">
          <filter id="pen" x="-2%" y="-2%" width="104%" height="104%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves={2} seed={4} />
            <feDisplacementMap in="SourceGraphic" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </svg>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const { me } = useLoaderData<typeof loader>();
  // a page of its own, without the site's nav (the game editor): its route's handle says `bare`
  const bare = useMatches().some((m) => (m.handle as { bare?: boolean } | undefined)?.bare);
  if (bare) return <Outlet />;
  return (
    <div className="shell">
      <SideNav me={me} />
      <div className="page"><Outlet /></div>
      <TabBar me={me} />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Something went wrong";
  let details = "Please try again.";
  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "Not found" : `Error ${error.status}`;
    details = error.status === 404 ? "There's nothing at this address." : error.statusText || details;
  } else if (import.meta.env.DEV && error instanceof Error) {
    details = error.message;
  }
  return (
    <main className="wrap narrow">
      <h1>{message}</h1>
      <p>{details}</p>
      <p><Link to="/">Back to all games</Link></p>
    </main>
  );
}
