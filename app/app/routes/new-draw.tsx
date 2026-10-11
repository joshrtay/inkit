// The old sketchpad page (inkit.games/new/draw) is gone: /new starts a blank page in paint, which
// converts the drawing itself instead of sending its picture to the reader. Old links land on /new
// (with the studio kept, as ?studio=).
import { redirect } from "react-router";
import type { Route } from "./+types/new-draw";

export function loader({ request }: Route.LoaderArgs) {
  const p = new URL(request.url).searchParams, want = p.get("studio") ?? p.get("in");
  return redirect(want ? `/new?studio=${encodeURIComponent(want)}` : "/new", 301);
}
