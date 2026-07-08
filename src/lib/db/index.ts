import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// postgres.js connects lazily -> importing never opens a socket; bad/missing
// DATABASE_URL only surfaces on an actual auth request, never breaks editor/build
const DEFAULT_URL = "postgres://chibi:chibi@localhost:5487/chibi";
const connectionString = process.env.DATABASE_URL ?? DEFAULT_URL;

// reuse one client across HMR reloads -> don't exhaust connections
const globalForDb = globalThis as unknown as {
  chibiPg?: ReturnType<typeof postgres>;
};
const client = globalForDb.chibiPg ?? postgres(connectionString, { max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.chibiPg = client;

export const db = drizzle(client, { schema });
