import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("signin", "routes/signin.tsx"),
  route("signup", "routes/signup.tsx"),
  route("api/auth/*", "routes/api.auth.ts"),
  route("g/:id", "routes/game.tsx"),
  // Collections live at the top level (wyattsgames.com/<slug>), so this route comes last.
  route(":slug", "routes/collection.tsx"),
] satisfies RouteConfig;
