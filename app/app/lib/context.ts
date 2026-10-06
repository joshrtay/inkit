import { createContext } from "react-router";

/** The Worker's bindings (D1, R2, vars and secrets) for loaders and actions: context.get(cloudflareContext). */
export const cloudflareContext = createContext<{ env: Env; ctx: ExecutionContext }>();
