import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("signin", "routes/signin.tsx"),
  route("signup", "routes/signup.tsx"),
  route("forgot-password", "routes/forgot-password.tsx"),
  route("reset-password", "routes/reset-password.tsx"),
  route("api/auth/*", "routes/api.auth.ts"),
  route("new", "routes/new.tsx"),
  route("new/draw", "routes/new-draw.tsx"),
  route("studios/new", "routes/studio-new.tsx"),
  route("explore", "routes/explore.tsx"),
  route("settings", "routes/settings.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("terms", "routes/terms.tsx"),
  route("puzzles", "routes/puzzles.tsx"),
  route("puzzles/:kind", "routes/puzzle-type.tsx"),
  route("g/:id", "routes/game.tsx"),
  route("g/:id/edit", "routes/game-edit.tsx"),
  route("g/:id/preview", "routes/game-preview.tsx"),
  route("g/:id/like", "routes/game-like.ts"),
  route("g/:id/solve", "routes/game-solve.ts"),
  route("g/:id/sketch", "routes/game-sketch.ts"),
  // admin endpoints (JSON): app/lib/admin.server.ts
  route("admin/reads/stats", "routes/admin-reads-stats.ts"),
  route("admin/reads.jsonl", "routes/admin-reads-export.ts"),
  route("admin/reads/:id", "routes/admin-read.ts"),
  route("admin/reads/:id/photo", "routes/admin-read-photo.ts"),
  route(":slug/settings", "routes/collection-settings.tsx"),
  // Collections live at the top level (inkit.games/<slug>), so this route comes last.
  route(":slug", "routes/collection.tsx"),
] satisfies RouteConfig;
