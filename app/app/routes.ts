import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("signin", "routes/signin.tsx"),
  route("signup", "routes/signup.tsx"),
  route("api/auth/*", "routes/api.auth.ts"),
  route("new", "routes/new.tsx"),
  route("studios/new", "routes/studio-new.tsx"),
  route("g/:id", "routes/game.tsx"),
  route("g/:id/edit", "routes/game-edit.tsx"),
  route(":slug/settings", "routes/collection-settings.tsx"),
  // Collections live at the top level (wyattsgames.com/<slug>), so this route comes last.
  route(":slug", "routes/collection.tsx"),
] satisfies RouteConfig;
