import { Chain } from "./chain/index.js";
import { Database } from "./db/index.js";
import { initDiscord } from "./discord/index.js";

var env = process.env.NODE_ENV || "development";

console.log(`NODE_ENV: ${env}`);
console.log(`NODE_EXTRA_CA_CERTS: ${process.env.NODE_EXTRA_CA_CERTS}`);

if (env === "development") {
  console.log(process.env);
}

// initialize database
if (!process.env.MONGO_URI) { throw new Error('Missing env var MONGO_URI, exiting') }
const db: Database = await Database.connect(process.env.MONGO_URI);


// start discord.js
if (!process.env.DISCORD_TOKEN) { throw new Error('Missing env var DISCORD_TOKEN, exiting') }
initDiscord(db, process.env.DISCORD_TOKEN);

// client.js:		loads all the event handlers for discord
// 					once discord.js client is ready, magic starts in events/ready.js
//
// events/ready.js:	fires off the poller that downloads the current nodes list,
// 					compares it to the database of monitored nodes, and sends dms when
//					node status changes have happened.

// const chain = await Chain.create(process.env.CHAIN_RPC_ENDPOINT!)
// chain.events();