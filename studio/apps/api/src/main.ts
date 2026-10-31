/** The API process. */
import { connect, loadConfig, makeQueues, makeStorage, migrate } from "@studio/server";
import { buildApp } from "./app.ts";

const config = loadConfig();
const db = connect(config);
await migrate(db);
const app = await buildApp({ config, db, storage: makeStorage(config), queues: makeQueues(config) });
await app.listen({ port: config.PORT, host: "0.0.0.0" });

const stop = async () => {
  await app.close();
  await db.end();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
