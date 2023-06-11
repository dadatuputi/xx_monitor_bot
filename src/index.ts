import { Database } from "./db/index.js";
import { initDiscord } from "./discord/index.js";

var env = process.env.NODE_ENV || "development";

console.log(`NODE_ENV: ${env}`);
console.log(`NODE_EXTRA_CA_CERTS: ${process.env.NODE_EXTRA_CA_CERTS}`);

// If in development, load & expand variables manually
if (env === "development") {
  var dotenv = (await import("dotenv")).config({ path: ".env" });
  var dotenvExpand = await import("dotenv-expand");
  dotenvExpand.expand(dotenv);

  console.log(dotenv);

  console.log(`NODE_EXTRA_CA_CERTS: ${process.env.NODE_EXTRA_CA_CERTS}`);

  // set mongodb uri to localhost
  process.env.MONGO_URI = `mongodb://${process.env.MONGO_INITDB_ROOT_USERNAME}:${process.env.MONGO_INITDB_ROOT_PASSWORD}@localhost:${process.env.MONGO_PORT}/`;
}

// initialize database
const db: Database = await Database.connect(process.env.MONGO_URI!);

// start discord.js
initDiscord(db, process.env.DISCORD_TOKEN!);

// client.js:		loads all the event handlers for discord
// 					once discord.js client is ready, magic starts in events/ready.js
//
// events/ready.js:	fires off the poller that downloads the current nodes list,
// 					compares it to the database of monitored nodes, and sends dms when
//					node status changes have happened.
