// A heart and how many have liked a puzzle. Tapping it likes (or unlikes) at once and saves in the
// background (routes/game-like.ts); signed out, it asks you to sign in first.
import { Link, useFetcher, useLocation } from "react-router";

export function LikeButton({ gameId, count, liked, signedIn, disabled = false }: {
  gameId: string; count: number; liked: boolean; signedIn: boolean;
  /** shown but not pressable (the editor's preview) */
  disabled?: boolean;
}) {
  const fetcher = useFetcher<{ count: number; liked: boolean }>();
  const { pathname } = useLocation();
  // what it will be once saved, while saving; then what the server says
  const saved = fetcher.data ?? { liked, count };
  const pending = fetcher.formData?.get("intent");
  const now = !pending ? saved : {
    liked: pending === "like",
    count: saved.count + (pending === "like" && !saved.liked ? 1 : pending === "unlike" && saved.liked ? -1 : 0),
  };
  const label = `${now.liked ? "Unlike" : "Like"} (${now.count} like${now.count === 1 ? "" : "s"})`;
  const heart = (
    <>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.2C1.4 8 3.4 4.5 7 4.5c2 0 3.6 1.1 5 3 1.4-1.9 3-3 5-3 3.6 0 5.6 3.5 4.3 6.8-1.8 4.6-9.3 9.2-9.3 9.2z" /></svg>
      <span>{now.count}</span>
    </>
  );
  if (!signedIn) return <Link className="like-btn" to={`/signin?next=${encodeURIComponent(pathname)}`} aria-label="Sign in to like this puzzle">{heart}</Link>;
  return (
    <fetcher.Form method="post" action={`/g/${gameId}/like`} className="like-form" onClick={(e) => e.stopPropagation()}>
      <button className={`like-btn${now.liked ? " liked" : ""}`} name="intent" value={now.liked ? "unlike" : "like"} aria-pressed={now.liked} aria-label={label} title={label} disabled={disabled}>
        {heart}
      </button>
    </fetcher.Form>
  );
}
