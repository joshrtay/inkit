import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

/** The database for one request. */
export const getDb = (env: Env) => drizzle(env.DB, { schema });
export type Db = ReturnType<typeof getDb>;
export { schema };
