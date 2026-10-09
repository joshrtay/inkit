// The old sketchpad page (inkit.games/new/draw) is gone: /new starts a blank page in paint, which
// converts the drawing itself instead of sending its picture to the reader. Old links land on /new
// (with a studio's ?in= kept).
import { redirect } from "react-router";
import type { Route } from "./+types/new-draw";

export function loader({ request }: Route.LoaderArgs) {
  const want = new URL(request.url).searchParams.get("in");
  return redirect(want ? `/new?in=${encodeURIComponent(want)}` : "/new");
}
