import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import * as schema from "./schema";

type DB = ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as unknown as { __rhSql?: postgres.Sql; __rhDb?: DB };

export class DatabaseNotConfigured extends Error {
  constructor() {
    super("DATABASE_URL is not configured.");
    this.name = "DatabaseNotConfigured";
  }
}

function create() {
  const e = env();
  if (!e.DATABASE_URL) throw new DatabaseNotConfigured();
  // One pool per process. `prepare: false` keeps us compatible with PgBouncer / Supavisor
  // transaction pooling, which is how we scale connections horizontally.
  const client = postgres(e.DATABASE_URL, {
    max: e.DATABASE_POOL_MAX,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
    connect_timeout: 10,
    prepare: false,
    onnotice: () => {},
  });
  return { client, db: drizzle(client, { schema, casing: "snake_case" }) };
}

export function getDb(): DB {
  if (!globalForDb.__rhDb) {
    const { client, db } = create();
    globalForDb.__rhSql = client;
    globalForDb.__rhDb = db;
  }
  return globalForDb.__rhDb;
}

export const db = new Proxy({} as DB, {
  get(_t, prop) {
    return Reflect.get(getDb() as object, prop);
  },
});

export async function pingDb(): Promise<boolean> {
  getDb();
  await globalForDb.__rhSql!`select 1`;
  return true;
}

export { schema };
