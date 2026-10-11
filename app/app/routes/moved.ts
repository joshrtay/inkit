// Addresses that moved under /api (docs/url-design.md: links don't die): GET or POST at the old
// one is sent on with 308, which keeps the method and the body.
import { redirect } from "react-router";
import type { Route } from "./+types/moved";

const onward = (request: Request) => { const u = new URL(request.url); return redirect(`/api${u.pathname}${u.search}`, 308); };
export const loader = ({ request }: Route.LoaderArgs) => onward(request);
export const action = ({ request }: Route.ActionArgs) => onward(request);
