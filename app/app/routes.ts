import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  // for search engines and AI agents (lib/seo.ts); a guide's Markdown (/puzzles/<kind>.md) is served by workers/app.ts
  route("robots.txt", "routes/robots.ts"),
  route("sitemap.xml", "routes/sitemap.ts"),
  route("llms.txt", "routes/llms.ts"),
  route("llms-full.txt", "routes/llms-full.ts"),
  route("signin", "routes/signin.tsx"),
  route("signup", "routes/signup.tsx"),
  route("account", "routes/account.ts"),   // your profile (the nav's Profile, signed out, signs in to it)
  route("forgot-password", "routes/forgot-password.tsx"),
  route("reset-password", "routes/reset-password.tsx"),
  // what only the site's own pages call (docs/url-design.md): under /api, never at a page's address
  route("api/auth/*", "routes/api.auth.ts"),
  route("api/feed", "routes/api.feed.ts"),   // the Subscriptions feed's next page
  route("api/sets", "routes/api.sets.ts"),   // your draft sets; make one
  route("api/sets/:id", "routes/api.set.ts"),   // a draft set, for the drawer
  route("api/bugs", "routes/api.bugs.ts"),   // Report a bug
  route("api/plays", "routes/api.plays.ts"),   // solve logging (off in Settings)
  // moved under /api: the old addresses keep working (308 keeps a POST's method and body)
  route("feed", "routes/moved.ts", { id: "moved-feed" }),
  route("bugs", "routes/moved.ts", { id: "moved-bugs" }),
  route("new", "routes/new.tsx"),
  route("new/draw", "routes/new-draw.tsx"),   // gone: redirects to /new
  route("studios/new", "routes/studio-new.tsx"),
  route("s/:id", "routes/set.tsx"),   // a set of puzzles
  route("explore", "routes/explore.tsx"),
  // a puzzle type's puzzles (New / Top, by difficulty), or every type's ("all": the quick chips)
  route("explore/:kind", "routes/explore-type.tsx"),
  route("settings", "routes/settings.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("terms", "routes/terms.tsx"),
  route("puzzles", "routes/puzzles.tsx"),
  route("puzzles/:kind", "routes/puzzle-type.tsx"),
  route("g/:id", "routes/game.tsx"),
  route("g/:id/edit", "routes/game-edit.tsx"),
  route("g/:id/draw", "routes/game-draw.tsx"),
  route("g/:id/publish", "routes/game-publish.tsx"),
  route("g/:id/preview", "routes/game-preview.tsx"),
  route("g/:id/like", "routes/game-like.ts"),
  route("g/:id/solve", "routes/game-solve.ts"),
  route("g/:id/sketch", "routes/game-sketch.ts"),
  route("g/:id/hints", "routes/game-hints.ts"),   // its author rewrites the puzzle's hints
  route("g/:id/hints/write", "routes/game-hints-write.ts"),   // the publish page: a draft's hints, once its solve is verified
  // admin endpoints (JSON): app/lib/admin.server.ts
  route("admin/reads/stats", "routes/admin-reads-stats.ts"),
  route("admin/reads.jsonl", "routes/admin-reads-export.ts"),
  route("admin/reads/:id", "routes/admin-read.ts"),
  route("admin/reads/:id/photo", "routes/admin-read-photo.ts"),
  route("admin/ai/schedule", "routes/admin-ai-schedule.ts"),
  route("admin/ai/backfill", "routes/admin-ai-backfill.ts"),
  route("admin/ai/recommendations", "routes/admin-ai-recommendations.ts"),
  route("admin/assessments", "routes/admin-assessments.ts"),
  route("admin/hints", "routes/admin-hints.ts"),   // the hint-ladder batch (puzzles/hints/write-site.ts)
  // bug reports (docs/bug-pipeline.md): sent from "Report a bug", reviewed by admins
  route("admin/bugs", "routes/admin-bugs.tsx"),
  route("admin/bugs/:id", "routes/admin-bug.tsx"),
  route("admin/bugs/:id/bundle", "routes/admin-bug-bundle.ts"),
  route("admin/bugs/:id/files/:file", "routes/admin-bug-file.ts"),
  // puzzle types asked for by a pasted link (/new) that we don't have yet
  route("admin/requests", "routes/admin-requests.tsx"),
  route(":slug/settings", "routes/collection-settings.tsx"),
  // Collections live at the top level (inkit.games/<slug>), so this route comes last.
  route(":slug", "routes/collection.tsx"),
] satisfies RouteConfig;
