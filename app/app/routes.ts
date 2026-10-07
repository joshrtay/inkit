import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("signin", "routes/signin.tsx"),
  route("signup", "routes/signup.tsx"),
  route("forgot-password", "routes/forgot-password.tsx"),
  route("reset-password", "routes/reset-password.tsx"),
  route("api/auth/*", "routes/api.auth.ts"),
  route("new", "routes/new.tsx"),
  route("studios/new", "routes/studio-new.tsx"),
  route("explore", "routes/explore.tsx"),
  route("privacy", "routes/privacy.tsx"),
  route("terms", "routes/terms.tsx"),
  route("puzzles", "routes/puzzles.tsx"),
  route("puzzles/:kind", "routes/puzzle-type.tsx"),
  route("g/:id", "routes/game.tsx"),
  route("g/:id/edit", "routes/game-edit.tsx"),
  route("g/:id/sketch", "routes/game-sketch.ts"),
  route(":slug/settings", "routes/collection-settings.tsx"),
  // Collections live at the top level (wyattsgames.com/<slug>), so this route comes last.
  route(":slug", "routes/collection.tsx"),
] satisfies RouteConfig;
